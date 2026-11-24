"""Print the contents of BEVE files: `python -m beve FILE [FILE ...]`."""
import pprint
import sys

import numpy as np

from . import load


def main(argv):
    if not argv:
        print(__doc__, file=sys.stderr)
        return 2
    np.set_printoptions(threshold=20, edgeitems=3)
    for path in argv:
        if len(argv) > 1:
            print(f"== {path}")
        pprint.pprint(load(path), sort_dicts=False)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
