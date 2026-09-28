#!/usr/bin/env python3
"""Start Insight Backlog.

    python3 run.py                 # http://localhost:8000
    python3 run.py --port 9000
    python3 run.py --seed          # load demo data first (empty database only)
"""
import argparse
import os
import sys

if sys.version_info < (3, 9):
    sys.exit("Insight Backlog needs Python 3.9+")

parser = argparse.ArgumentParser(description="Insight Backlog server")
parser.add_argument("--host", default=os.environ.get("IB_HOST", "0.0.0.0"))
parser.add_argument("--port", type=int, default=int(os.environ.get("IB_PORT", "8000")))
parser.add_argument("--seed", action="store_true", help="load demo data if the database is empty")
args = parser.parse_args()

os.environ.setdefault("IB_BASE_URL", "http://localhost:%d" % args.port)

from server.app import serve  # noqa: E402  (after env is set)

if args.seed:
    from server.seed import seed
    seed()

serve(args.host, args.port)
