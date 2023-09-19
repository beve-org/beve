# Design of EVE

EVE is designed to avoid branches, both for runtime efficiency and simpler codebases. Branching how a type is handled is only built into the specification when a huge performance benefit or size efficiency is achieved. EVE could have included a small string tag, to save a byte for short strings, but this would have added complexity to the specification and it wouldn't have affected keys or strings within a typed array.
