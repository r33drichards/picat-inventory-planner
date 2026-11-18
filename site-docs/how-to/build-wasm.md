# Build and publish WebAssembly

Activate Emscripten 4.0.21 and make sure Git, Make, Bash, and Node.js are available.
From the repository root, run these commands.

```bash
bash build-wasm.sh
bash smoke-test.sh
node dist/picat.js < example.in
```

The build fetches a [pinned Picat revision](https://github.com/r33drichards/picat/tree/2d00e3a456c2f7736940e1a1ed66e7b0aef8e021),
embeds `inventory.pi` in the WebAssembly distribution, and writes the Node.js
launcher, WebAssembly module, and Picat license to `dist/`.

## Publish a release

In GitHub Actions, select **Build planner WASM**, choose **Run workflow** on
`main`, and enter an unused version tag such as `v0.1.1`. You can also push a
version tag to trigger the same build and publish jobs. Once the smoke tests
pass, the workflow attaches `picat.js`, `picat.wasm`, and `Picat-LICENSE.txt`
to the GitHub release.
