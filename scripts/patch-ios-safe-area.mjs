/**
 * iOS：把 Capacitor WebView 顶边缩到 safe-area（状态栏/刘海）之下。
 * 远程 H5 顶部栏（返回键+标题）没做 safe-area，edge-to-edge 时压在状态栏时钟下、返回键点不到。
 * CAPBridgeViewController 里 view = WebView，故用一个安全区容器 VC 包住 bridge，
 * 让 WebView 顶边对齐 safeAreaLayoutGuide.topAnchor。
 * 在 `npx cap add ios` 之后运行，对生成的 SceneDelegate.swift 做定点替换（不新增文件，避免改 pbxproj）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sceneDelegate = path.join(root, 'ios/App/App/SceneDelegate.swift');

if (!fs.existsSync(sceneDelegate)) {
  console.warn('patch-ios-safe-area: SceneDelegate.swift missing, skip');
  process.exit(0);
}

let src = fs.readFileSync(sceneDelegate, 'utf8');

const CONTAINER_CLASS = `    var window: UIWindow?

    // Insets the Capacitor WebView below the status bar / notch. The remote H5 top bar
    // (back button + title) has no safe-area handling, so edge-to-edge left it under the
    // status-bar clock (back button untappable). Wrap the bridge in a safe-area container.
    private final class SafeAreaContainerViewController: UIViewController {
        private let bridge = CAPBridgeViewController()

        override func viewDidLoad() {
            super.viewDidLoad()
            view.backgroundColor = UIColor.systemBackground
            addChild(bridge)
            let bridgeView = bridge.view!
            bridgeView.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(bridgeView)
            NSLayoutConstraint.activate([
                bridgeView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
                bridgeView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                bridgeView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                bridgeView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
            ])
            bridge.didMove(toParent: self)
        }
    }`;

const OLD_VAR = '    var window: UIWindow?';
const OLD_ROOT = 'window?.rootViewController = CAPBridgeViewController()';
const NEW_ROOT = 'window?.rootViewController = SafeAreaContainerViewController()';

let ok = true;

if (!src.includes(OLD_ROOT)) {
  console.warn('patch-ios-safe-area: rootViewController line not found — already patched or template changed');
  ok = false;
} else {
  src = src.replace(OLD_ROOT, NEW_ROOT);
}

if (!src.includes('private final class SafeAreaContainerViewController')) {
  if (!src.includes(OLD_VAR)) {
    console.warn('patch-ios-safe-area: "var window" line not found — cannot insert container class');
    ok = false;
  } else {
    src = src.replace(OLD_VAR, CONTAINER_CLASS);
  }
}

if (!ok) {
  console.error('::error::patch-ios-safe-area failed to patch SceneDelegate.swift');
  process.exit(1);
}

fs.writeFileSync(sceneDelegate, src);
console.log('patch-ios-safe-area: SceneDelegate.swift wrapped bridge in SafeAreaContainerViewController');
