import Capacitor

class DoveBevoViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(DoveBevoHttpPlugin())
    }
}
