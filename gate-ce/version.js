/* Single source of the GATE CE app version.
 * Read by the web page (update check), by the Android build (versionCode/versionName)
 * and fetched online by older copies to detect that an update is available.
 * Bump "code" by 1 and change "name" whenever the site or app changes. */
window.GATE_VERSION = { code: 13, name: "2.8", notes: "Update check for the website and the Android app" };
