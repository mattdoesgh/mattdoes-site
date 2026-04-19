# fixture-vault

Minimal vault used by CI so the build step can run without needing to clone the
private `mattdoes-vault` submodule. Exercises one of each publish type.

Not a replacement for the real vault — just enough for `npm run build` to
produce valid HTML so `html-validate` can do its job.
