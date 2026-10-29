import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        let acceptance = RulesAcceptance()
        if acceptance.isCurrent {
            window.rootViewController = NativeTabsController()
        } else {
            let navigationController = UINavigationController()
            let welcome = WelcomeViewController { [weak window] in
                guard let window else { return }
                acceptance.acceptCurrentVersion()
                window.rootViewController = NativeTabsController()
            }
            navigationController.setViewControllers([welcome], animated: false)
            window.rootViewController = navigationController
        }
        window.makeKeyAndVisible()
        self.window = window
    }
}
