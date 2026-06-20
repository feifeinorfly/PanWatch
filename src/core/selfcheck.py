"""系统自检(Doctor):一键体检 数据源 / AI / 通知,带中文修复提示。

复用各自现有的 test 逻辑(数据源 manager.test_source、AI AIClient.chat、通知 NotifierManager),
不重造探测;补两件事:① 并发聚合成一块看板 ② 常见错误 → 中文 actionable 修复提示。

通知默认**只校验 URI 配置不真发**(防刷屏);notify_send=True 才真实发送。
"""

from __future__ import annotations

import asyncio
import logging
import time

from src.web.database import SessionLocal

logger = logging.getLogger(__name__)

SLOW_MS = 4000          # 超过算「慢」
PROBE_TIMEOUT_S = 20    # 单项探测超时


def classify_hint(category: str, error: str | None) -> str:
    """错误 → 中文 actionable 修复提示。覆盖自托管最常见的代理/鉴权/配置坑。"""
    e = (error or "").lower()
    if category == "datasource":
        if "database is locked" in e:
            return "SQLite 被锁:并发调度叠加慢代理所致,降低并发或加快/关闭代理。"
        if any(k in e for k in (
            "server disconnected", "timeout", "timed out", "connect", "proxy",
            "ssl", "remote end closed", "read timed out", "connection reset",
        )):
            return "疑似代理拦截国内行情/新闻接口:CN 采集器需直连(trust_env=False),或检查 HTTP_PROXY / NO_PROXY 设置。"
        return "数据源不通:打开数据源配置页看详细日志,确认 provider 与接口可达。"
    if category == "ai":
        if any(k in e for k in ("401", "unauthorized", "invalid_api_key", "api key", "incorrect api key", "authentication")):
            return "AI 鉴权失败:API Key 不对或失效,检查服务商 api_key。"
        if any(k in e for k in ("model", "not found", "does not exist", "404")):
            return "模型不存在:检查模型名(model)是否与服务商一致。"
        if any(k in e for k in ("429", "rate limit", "quota", "insufficient", "balance")):
            return "被限流或额度不足:稍后重试,或检查账户余额/额度。"
        if any(k in e for k in ("connect", "timeout", "timed out", "proxy", "ssl", "getaddrinfo", "name resolution")):
            return "连不上 AI 服务:检查 base_url 是否正确、是否需要/误用了代理。"
        return "AI 调用失败:逐项检查 base_url / api_key / model 配置。"
    if category == "notify":
        if any(k in e for k in ("invalid", "unsupported", "scheme", "malformed", "parse", "config")):
            return "通知配置无效:检查渠道 URL/参数格式(Apprise URI)。"
        if any(k in e for k in ("forbidden", "unauthorized", "403", "401", "404", "blocked", "connect", "timeout")):
            return "通知发送失败:检查 webhook 地址/token 是否正确、是否被网络拦截。"
        return "通知不通:核对渠道配置,或到渠道页点「测试」做真实发送验证。"
    return error or "未知错误,查看日志。"


def _item(category: str, key: str, name: str, status: str,
          latency_ms: int, error: str | None = None, note: str | None = None) -> dict:
    return {
        "category": category,
        "key": key,
        "name": name,
        "status": status,  # ok | slow | fail
        "latency_ms": int(latency_ms),
        "error": error,
        "hint": classify_hint(category, error) if status == "fail" else "",
        "note": note,
    }


def _status_for(success: bool, latency_ms: int) -> str:
    if not success:
        return "fail"
    return "slow" if latency_ms > SLOW_MS else "ok"


async def probe_datasource(source) -> dict:
    """复用 collector manager.test_source。"""
    from src.core.data_collector import get_collector_manager

    t0 = time.monotonic()
    try:
        result = await get_collector_manager().test_source(source)
        latency = int(getattr(result, "duration_ms", None) or (time.monotonic() - t0) * 1000)
        return _item("datasource", f"ds:{source.id}", source.name,
                     _status_for(bool(result.success), latency), latency,
                     None if result.success else (result.error or "测试未通过"))
    except Exception as e:
        return _item("datasource", f"ds:{source.id}", source.name, "fail",
                     int((time.monotonic() - t0) * 1000), str(e))


async def probe_ai_model(model, service) -> dict:
    """复用 AIClient.chat 发一个极短 ping。"""
    from src.core.ai_client import AIClient

    name = model.name or model.model
    t0 = time.monotonic()
    try:
        client = AIClient(base_url=service.base_url, api_key=service.api_key, model=model.model)
        await client.chat(system_prompt="You are a helpful assistant.",
                          user_content="Say 'OK'.", temperature=0)
        latency = int((time.monotonic() - t0) * 1000)
        return _item("ai", f"ai:{model.id}", name, _status_for(True, latency), latency)
    except Exception as e:
        return _item("ai", f"ai:{model.id}", name, "fail",
                     int((time.monotonic() - t0) * 1000), str(e))


async def probe_notify_channel(channel, *, send: bool = False) -> dict:
    """默认只校验 URI 配置(add_channel 不通会抛);send=True 才真实发送。"""
    from src.core.notifier import NotifierManager

    name = channel.name or channel.type
    t0 = time.monotonic()
    try:
        notifier = NotifierManager()
        notifier.add_channel(channel.type, channel.config or {})  # URI 非法会抛
        if not send:
            latency = int((time.monotonic() - t0) * 1000)
            return _item("notify", f"nc:{channel.id}", name, "ok", latency,
                         note="仅校验配置格式,未真实发送(勾选「含真实发送」可发测试消息)")
        result = await notifier.notify_with_result(
            title="系统自检", content="盯盘侠系统自检测试消息。", bypass_quiet_hours=True)
        latency = int((time.monotonic() - t0) * 1000)
        ok = bool(result.get("success"))
        return _item("notify", f"nc:{channel.id}", name, _status_for(ok, latency), latency,
                     None if ok else (result.get("error") or "发送失败"))
    except Exception as e:
        return _item("notify", f"nc:{channel.id}", name, "fail",
                     int((time.monotonic() - t0) * 1000), str(e))


async def _guard(coro, fallback: dict) -> dict:
    """给每个 probe 套超时;探测自身已 try/except,这里只兜超时/异常。"""
    try:
        return await asyncio.wait_for(coro, timeout=PROBE_TIMEOUT_S)
    except asyncio.TimeoutError:
        return _item(fallback["category"], fallback["key"], fallback["name"],
                     "fail", PROBE_TIMEOUT_S * 1000, f"探测超时(>{PROBE_TIMEOUT_S}s)")
    except Exception as e:  # pragma: no cover - 防御
        return _item(fallback["category"], fallback["key"], fallback["name"],
                     "fail", 0, str(e))


def _enumerate(db) -> list[dict]:
    """枚举所有启用的待检项(身份 + ORM 引用),不探测。"""
    from src.web.models import AIModel, AIService, DataSource, NotifyChannel

    targets: list[dict] = []
    for src in db.query(DataSource).filter(DataSource.enabled.is_(True)).all():
        targets.append({"category": "datasource", "key": f"ds:{src.id}", "name": src.name,
                        "group": None, "_kind": "ds", "_obj": src})
    for model in db.query(AIModel).all():
        service = db.query(AIService).filter(AIService.id == model.service_id).first()
        if not service:
            continue
        # group = 服务商名,供前端做「服务商 → 模型」两级层级
        targets.append({"category": "ai", "key": f"ai:{model.id}", "name": model.name or model.model,
                        "group": service.name, "_kind": "ai", "_obj": model, "_service": service})
    for ch in db.query(NotifyChannel).filter(NotifyChannel.enabled.is_(True)).all():
        targets.append({"category": "notify", "key": f"nc:{ch.id}", "name": ch.name or ch.type,
                        "group": None, "_kind": "nc", "_obj": ch})
    return targets


def _identity(t: dict) -> dict:
    return {"category": t["category"], "key": t["key"], "name": t["name"], "group": t.get("group")}


def _probe_for(t: dict, notify_send: bool):
    if t["_kind"] == "ds":
        return probe_datasource(t["_obj"])
    if t["_kind"] == "ai":
        return probe_ai_model(t["_obj"], t["_service"])
    return probe_notify_channel(t["_obj"], send=notify_send)


def list_selfcheck_items(*, db=None) -> list[dict]:
    """只枚举待检项身份(category/key/name),不探测;供前端先渲染列表再逐项检查。"""
    own = db is None
    db = db or SessionLocal()
    try:
        return [_identity(t) for t in _enumerate(db)]
    finally:
        if own:
            db.close()


async def run_selfcheck(*, db=None, notify_send: bool = False, keys=None) -> dict:
    """探测启用项,返回看板。keys 非空时只探测这些 key(供前端逐项更新进度)。"""
    own = db is None
    db = db or SessionLocal()
    try:
        keyset = set(keys) if keys is not None else None
        targets = [t for t in _enumerate(db) if keyset is None or t["key"] in keyset]
        tasks = [_guard(_probe_for(t, notify_send), _identity(t)) for t in targets]
        items = list(await asyncio.gather(*tasks)) if tasks else []
        summary = {
            "total": len(items),
            "ok": sum(1 for i in items if i["status"] == "ok"),
            "slow": sum(1 for i in items if i["status"] == "slow"),
            "fail": sum(1 for i in items if i["status"] == "fail"),
        }
        return {"items": items, "summary": summary, "notify_send": bool(notify_send)}
    finally:
        if own:
            db.close()
