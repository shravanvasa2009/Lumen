import ExpoModulesCore

// Drawn natively; no frame reaches JS.
final class LumenPreviewView: ExpoView {
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // UIView does not clip sublayers unless asked; the parent rounds the circle.
    clipsToBounds = true
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      LivePreview.attach(self)
    } else {
      LivePreview.detach(self)
    }
  }

  // React Native sizes this view; the preview layer fills it.
  override func layoutSubviews() {
    super.layoutSubviews()
    LivePreview.layout(self)
  }
}
