"""
Run every gate check, one after another, and print a summary.

    python tests/run-all.py            all five gates
    python tests/run-all.py 3 4        just gates 3 and 4

Each gate drives a real Chrome browser against the real game, so the
whole set takes several minutes. Watch the PASS/FAIL lines go by, or
just read the summary at the end.
"""

import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent

WHAT_EACH_ONE_COVERS = {
    1: "the map, and region tinting",
    2: "Mode 1, multiple choice, and the scoring",
    3: "Modes 2 and 3, spelling, and the backspace limit",
    4: "the bonus runner: jumping, hazards, stuns, coins",
    5: "high scores, sound, artwork, and saving between visits"
}


def main():
    wanted = [int(a) for a in sys.argv[1:] if a.isdigit()] or sorted(WHAT_EACH_ONE_COVERS)

    results = []
    for n in wanted:
        script = HERE / f"gate{n}.py"
        if not script.exists():
            print(f"\n!! gate{n}.py not found, skipping")
            continue

        print("\n" + "=" * 62)
        print(f"GATE {n} - {WHAT_EACH_ONE_COVERS.get(n, '')}")
        print("=" * 62)

        began = time.time()
        # Force UTF-8: the spelling gate prints back-arrows, which a
        # default Windows console cannot encode.
        finished = subprocess.run(
            [sys.executable, str(script)],
            env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"}
        )
        took = time.time() - began

        results.append((n, finished.returncode == 0, took))

    print("\n" + "=" * 62)
    print("SUMMARY")
    print("=" * 62)
    for n, ok, took in results:
        print(f"  Gate {n}   {'passed' if ok else 'FAILED'}   ({took:.0f}s)"
              f"   {WHAT_EACH_ONE_COVERS.get(n, '')}")

    failed = [n for n, ok, _ in results if not ok]
    if failed:
        print(f"\n{len(failed)} gate(s) failed: {failed}")
        sys.exit(1)
    print("\nEverything passed.")


if __name__ == "__main__":
    main()
