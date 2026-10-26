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
        let navigationController = UINavigationController()
        let acceptance = RulesAcceptance()
        if acceptance.isCurrent {
            navigationController.setViewControllers([BrowserViewController()], animated: false)
        } else {
            let welcome = WelcomeViewController { [weak navigationController] in
                guard let navigationController else { return }
                acceptance.acceptCurrentVersion()
                navigationController.setViewControllers([BrowserViewController()], animated: false)
            }
            navigationController.setViewControllers([welcome], animated: false)
        }
        window.rootViewController = navigationController
        window.makeKeyAndVisible()
        self.window = window
    }
}
