# Image processing fixtures

Both fixtures are derived from the same real garment photograph, `Mundu black
shirt.jpg`, published under CC0 on Wikimedia Commons:

https://commons.wikimedia.org/wiki/File:Mundu_black_shirt.jpg

- `mundu-black-shirt-close.jpg` is the original 1078 x 1128 photograph. Its
  close crop intentionally produces a low lightweight quality score and tests
  automatic BiRefNet fallback.
- `mundu-black-shirt-standard.jpg` preserves the photograph's garment pixels,
  scales them proportionally, and adds only a white 1600 x 1600 canvas. It
  represents the expected product-station framing and tests the lightweight
  success path.

SHA-256:

- `mundu-black-shirt-close.jpg`: `3feb7ed3ee88ee1332ff25b2903caf4157ba2dc4b5ab60081285fc34fbba8c59`
- `mundu-black-shirt-standard.jpg`: `7aad51fe7fa56820c573ced36d65ed33fa1c0bc643cff3d298e162cc1da3d8e2`
