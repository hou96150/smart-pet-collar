"""智慧寵物項圈的模擬推論命令列。"""

import argparse
import json
from typing import Mapping, Sequence
from urllib import error, request
from urllib.parse import urlsplit

from .events import EMOTIONS, RISK_LEVELS, create_event
from .hardware import Buzzer, SafeMockBuzzer
from .inference import SimulationInferencer


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="產生明確標示的模擬辨識事件")
    parser.add_argument("--emotion", choices=EMOTIONS, required=True)
    parser.add_argument("--confidence", type=float, required=True)
    parser.add_argument(
        "--risk-level",
        choices=RISK_LEVELS,
        help="離線輸出時必填；送到後端時由後端重新判定",
    )
    parser.add_argument("--audio-file")
    parser.add_argument(
        "--server-url",
        help="後端根網址，例如 http://127.0.0.1:3000",
    )
    return parser


def _is_local_http(url: str) -> bool:
    parsed = urlsplit(url)
    return parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}


def _build_local_http_opener() -> request.OpenerDirector:
    opener = request.OpenerDirector()
    for handler in (
        request.ProxyHandler({}),
        request.UnknownHandler(),
        request.HTTPHandler(),
        request.HTTPDefaultErrorHandler(),
        request.HTTPRedirectHandler(),
        request.HTTPErrorProcessor(),
    ):
        opener.add_handler(handler)
    return opener


def post_event(server_url: str, payload: dict) -> dict:
    """把推論資料送到後端，並取得後端補齊風險規則後的完整事件。"""

    endpoint = f"{server_url.rstrip('/')}/api/events"
    body = json.dumps(payload).encode("utf-8")
    http_request = request.Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        if _is_local_http(endpoint):
            response_context = _build_local_http_opener().open(
                http_request,
                timeout=10,
            )
        else:
            response_context = request.urlopen(http_request, timeout=10)
        with response_context as response:
            return json.loads(response.read().decode("utf-8"))
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"無法從後端取得辨識事件：{exc}") from exc


def alert_if_high_risk(event: Mapping[str, object], buzzer: Buzzer) -> bool:
    """只在共用事件被判定為高風險時觸發蜂鳴器。"""

    if event.get("riskLevel") != "high":
        return False
    buzzer.alert()
    return True


def main(
    argv: Sequence[str] | None = None,
    *,
    buzzer: Buzzer | None = None,
) -> int:
    """執行一筆模擬辨識，選擇輸出 JSON 或送入本機即時資料流。

    第一版固定使用 ``SimulationInferencer``。日後串接真實 CNN 時，替換點
    是此處建立與呼叫 inferencer 的區段，但輸出的 emotion、confidence 與
    source 仍必須符合 ``events.py`` 的共用契約。
    """

    parser = build_parser()
    args = parser.parse_args(argv)
    if buzzer is None:
        buzzer = SafeMockBuzzer()
    inferencer = SimulationInferencer()
    emotion, confidence = inferencer.predict(
        emotion=args.emotion,
        confidence=args.confidence,
    )
    if args.server_url:
        # 連線模式不接受 Python 自訂風險；後端是風險規則的唯一權威來源。
        try:
            event = post_event(
                args.server_url,
                {
                    "emotion": emotion,
                    "confidence": confidence,
                    "source": inferencer.source,
                    "audioFile": args.audio_file,
                },
            )
        except RuntimeError as exc:
            parser.error(str(exc))
        alert_if_high_risk(event, buzzer)
        print(json.dumps(event, ensure_ascii=False))
        return 0

    if args.risk_level is None:
        parser.error("未指定 --server-url 時，必須提供 --risk-level")

    try:
        event = create_event(
            emotion=emotion,
            confidence=confidence,
            risk_level=args.risk_level,
            source=inferencer.source,
            audio_file=args.audio_file,
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    event_data = event.to_dict()
    alert_if_high_risk(event_data, buzzer)
    print(json.dumps(event_data, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
