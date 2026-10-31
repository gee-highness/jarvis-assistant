#!/usr/bin/env node
/**
 * Generates/updates the Capacitor Android project and injects Jarvis's native layer:
 * JarvisDevice plugin, widgets, shortcuts, deep links, permissions, icons and cleartext config.
 * Idempotent: safe to run on every build.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'android');
const run = cmd => execSync(cmd, { cwd: root, stdio: 'inherit' });

if (!existsSync(join(root, 'dist/jarvis/browser/index.html'))) {
  console.error('Web build missing: run `npm run build` first.');
  process.exit(1);
}
if (!existsSync(join(android, 'app/build.gradle'))) run('npx cap add android');

// ---- llama.cpp (on-device engine), pinned for reproducible builds ----
export const LLAMA_TAG = 'b11936';
const llamaDir = join(root, 'native/cpp/llama.cpp');
if (!existsSync(join(llamaDir, 'CMakeLists.txt'))) {
  run(`git clone --depth 1 --branch ${LLAMA_TAG} https://github.com/ggml-org/llama.cpp "${llamaDir}"`);
}

// ---- java sources ----
const pkgDir = join(android, 'app/src/main/java/com/jarvis/assistant');
mkdirSync(pkgDir, { recursive: true });
for (const f of readdirSync(join(root, 'native/java'))) cpSync(join(root, 'native/java', f), join(pkgDir, f));

// ---- resources ----
cpSync(join(root, 'native/res'), join(android, 'app/src/main/res'), { recursive: true });
// ---- manifest ----
const manifestPath = join(android, 'app/src/main/AndroidManifest.xml');
let m = readFileSync(manifestPath, 'utf8');

const permissions = [
  'android.permission.INTERNET',
  'android.permission.RECORD_AUDIO',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.WAKE_LOCK',
  'android.permission.VIBRATE',
  'com.android.alarm.permission.SET_ALARM',
  'com.termux.permission.RUN_COMMAND',
  'android.permission.READ_CALENDAR',
  'android.permission.READ_CONTACTS',
  'android.permission.SEND_SMS',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.ACTIVITY_RECOGNITION',
  'android.permission.PACKAGE_USAGE_STATS',
];
for (const p of permissions) {
  if (!m.includes(`android:name="${p}"`)) m = m.replace('<application', `<uses-permission android:name="${p}" />\n    <application`);
}

if (!m.includes('<queries>')) {
  m = m.replace('<application', `<queries>
        <package android:name="com.termux" />
        <intent><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent>
        <intent><action android:name="android.speech.RecognitionService" /></intent>
        <intent><action android:name="android.intent.action.TTS_SERVICE" /></intent>
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent>
    </queries>
    <application`);
}

if (!m.includes('networkSecurityConfig')) {
  m = m.replace('<application', '<application\n        android:usesCleartextTraffic="true"\n        android:networkSecurityConfig="@xml/jarvis_network_security"');
}

// deep link + shortcuts on MainActivity
if (!m.includes('android:scheme="jarvis"')) {
  m = m.replace(/(<activity[\s\S]*?android:name="\.?MainActivity"[\s\S]*?>)/, `$1
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="jarvis" />
            </intent-filter>
            <meta-data android:name="android.app.shortcuts" android:resource="@xml/jarvis_shortcuts" />`);
}

// widgets (each receiver added once)
const widgets = [
  ['JarvisMicWidget', 'jarvis_widget_mic', 'jarvis_widget_mic_info'],
  ['JarvisWideWidget', 'jarvis_widget_wide', 'jarvis_widget_wide_info'],
  ['JarvisChatWidget', 'jarvis_widget_chat', 'jarvis_widget_chat_info'],
  ['JarvisTodayWidget', 'jarvis_widget_today', 'jarvis_widget_today_info'],
  ['JarvisPetWidget', 'jarvis_widget_pet', 'jarvis_widget_pet_info'],
];
for (const [cls, label, info] of widgets) {
  if (m.includes(`.${cls}"`)) continue;
  m = m.replace('</application>', `    <receiver android:name=".${cls}" android:exported="true" android:label="@string/${label}">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/${info}" />
        </receiver>
    </application>`);
}

// always-on companion: foreground service, boot restart, notification counter (all opt-in at runtime)
if (!m.includes('.JarvisCoreService"')) {
  m = m.replace('</application>', `    <service android:name=".JarvisCoreService" android:exported="false" android:foregroundServiceType="specialUse">
            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="Personal assistant that logs on-device wellbeing signals (steps, screen time, sleep) chosen by the user" />
        </service>
        <receiver android:name=".JarvisBootReceiver" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
        <service android:name=".JarvisNotificationListener" android:exported="true" android:label="Jarvis"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
            <intent-filter><action android:name="android.service.notification.NotificationListenerService" /></intent-filter>
        </service>
    </application>`);
}
if (!m.includes('xmlns:tools')) m = m.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ');
m = m.replace('<uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" />', '<uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" tools:ignore="ProtectedPermissions" />');

// keep the WebView alive and avoid re-creating the activity on widget taps
m = m.replace(/android:launchMode="[^"]*"/, 'android:launchMode="singleTask"');
if (!/android:launchMode=/.test(m)) m = m.replace(/(android:name="\.?MainActivity")/, '$1\n            android:launchMode="singleTask"');

writeFileSync(manifestPath, m);

// native libs must be extracted to disk: ggml loads its CPU backend variants with dlopen()
if (!m.includes('extractNativeLibs')) m = m.replace('<application', '<application\n        android:extractNativeLibs="true"');
writeFileSync(manifestPath, m);

// ---- gradle: build llama.cpp + JNI engine with the NDK ----
const gradlePath = join(android, 'app/build.gradle');
let g = readFileSync(gradlePath, 'utf8');
if (!g.includes('jarvis-native')) {
  g += `
// jarvis-native: on-device LLM engine (llama.cpp) built from native/cpp
android {
    ndkVersion "29.0.13113456"
    defaultConfig {
        ndk { abiFilters ${(process.env.JARVIS_ABIS || 'arm64-v8a').split(/[ ,]+/).filter(Boolean).map(a => `'${a}'`).join(', ')} }
        externalNativeBuild {
            cmake {
                arguments '-DCMAKE_BUILD_TYPE=Release', '-DANDROID_STL=c++_shared'
            }
        }
    }
    externalNativeBuild {
        cmake {
            path file('../../native/cpp/CMakeLists.txt')
            version '3.31.6'
            buildStagingDirectory file('../../native/.cxx')
        }
    }
    packaging {
        jniLibs { useLegacyPackaging true }
    }
    signingConfigs {
        jarvis {
            if (System.getenv('JARVIS_KEYSTORE')) {
                storeFile file(System.getenv('JARVIS_KEYSTORE'))
                storePassword System.getenv('JARVIS_KS_PASS')
                keyAlias 'jarvis'
                keyPassword System.getenv('JARVIS_KS_PASS')
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv('JARVIS_KEYSTORE')) { signingConfig signingConfigs.jarvis }
            minifyEnabled false
        }
        debug {
            if (System.getenv('JARVIS_KEYSTORE')) { signingConfig signingConfigs.jarvis }
        }
    }
    lint {
        checkReleaseBuilds false
        abortOnError false
    }
}
`;
  writeFileSync(gradlePath, g);
}

// ---- app name ----
const stringsPath = join(android, 'app/src/main/res/values/strings.xml');
if (existsSync(stringsPath)) {
  let s = readFileSync(stringsPath, 'utf8');
  s = s.replace(/<string name="app_name">[^<]*<\/string>/, '<string name="app_name">Jarvis</string>')
       .replace(/<string name="title_activity_main">[^<]*<\/string>/, '<string name="title_activity_main">Jarvis</string>');
  writeFileSync(stringsPath, s);
}

run('npx cap sync android');
console.log('\n✓ Android project ready. Build with: cd android && ./gradlew assembleDebug');
