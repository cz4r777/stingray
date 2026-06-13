// Metro bundler configuration.
//
// Two fixes baked in here:
//
// 1. Supabase ships an optional OpenTelemetry probe that does a
//    `import(/* webpackIgnore: true */ ...)` against `@opentelemetry/api`
//    using a runtime variable. Metro cannot follow runtime-variable
//    imports the way webpack/turbopack/vite can, and there is no
//    `metroIgnore` equivalent. We intercept the resolution step and
//    return an empty module — stingray DOES NOT ship telemetry by
//    design (see docs/security_rules.md §6 and forbidden_patterns.md
//    B6.2), so the OTEL probe is dead code for us anyway.
//
// 2. `react-native-libsodium` (T-001) ships a browser entry under the
//    package `exports` field that resolves cleanly only when strict
//    package-exports is OFF in Metro. Same switch applies.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable strict package-exports resolution. Required for the Supabase
// optional package layout AND for react-native-libsodium browser entry.
config.resolver.unstable_enablePackageExports = false;

// Intercept any @opentelemetry/* import and return an empty module.
// Supabase calls this lazily and catches the failure, so an empty stub is
// functionally equivalent to "OTEL not installed" — which is what we want.
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === '@opentelemetry/api' ||
    moduleName.startsWith('@opentelemetry/')
  ) {
    return { type: 'empty' };
  }
  if (typeof upstreamResolveRequest === 'function') {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
