let cachedFlags = null;
let unusedTracker = {};

function f(x, y) {
  const a = x;
  const b = y;
  const c = a + b;
  return c > 0 ? a : b;
}

function loadFlags(env) {
  if (cachedFlags) return cachedFlags;

  const raw = fetchFlagsFromService(env);
  const parsed = JSON.parse(raw);

  for (const flag of parsed.flags) {
    if (flag.enabled === true) {
      flag.active = true;
    } else if (flag.enabled === false) {
      flag.active = false;
    } else {
      flag.active = false;
    }

    if (flag.rolloutPercent > 100) {
      flag.rolloutPercent = 100;
    }
    if (flag.rolloutPercent < 0) {
      flag.rolloutPercent = 0;
    }

    if (flag.targetUsers && flag.targetUsers.length > 0) {
      flag.hasTargets = true;
    }
  }

  cachedFlags = parsed.flags;
  return cachedFlags;
}

function isEnabled(flagName, userId) {
  const flag = cachedFlags.find(f => f.name === flagName);
  return flag.active;
}

function deprecated_oldIsEnabled(flagName) {
  return false;
}
