from configparser import ConfigParser
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent

def load_config(config_path: str | None = None) -> dict:
    """Load settings from config.ini."""
    path = Path(config_path) if config_path else _PROJECT_ROOT / "config.ini"
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    cp = ConfigParser()
    cp.read(path)
    return {
        "api_key": cp["keys"]["api_key"],
        "private_key_path": str(_PROJECT_ROOT / cp["keys"]["private_key_path"]),
        "endpoint": cp.get("connection", "endpoint",
                           fallback="tcp+tls://fix-md.testnet.binance.vision:9000"),
    }
