"""A BEVE (Binary Efficient Versatile Encoding) decoder that returns numeric arrays as numpy arrays.

    import beve
    data = beve.load("file.beve")      # or beve.loads(buffer)

See `beve.reader` for how each BEVE type maps to Python.
"""
from .reader import BeveError, load, loads

__all__ = ["BeveError", "load", "loads"]
