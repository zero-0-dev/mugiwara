function readPackage(pkg, context) {
  if (pkg.name === "dmg-builder") {
    if (pkg.optionalDependencies?.["dmg-license"]) {
      pkg.dependencies = pkg.dependencies || {};
      pkg.dependencies["dmg-license"] = pkg.optionalDependencies["dmg-license"];
      delete pkg.optionalDependencies["dmg-license"];
    }
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
