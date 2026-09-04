import QtQuick
import Quickshell
import Quickshell.Io

Item {
  id: root
  visible: false

  property var shell: null
  property var manifest: null
  property bool flagsChanged: false
  property string lastError: ""
  property int siteCount: 0

  readonly property string webthemeScript: Qt.resolvedUrl("bin/webtheme").toString().replace("file://", "")

  function setup() {
    if (!webthemeScript || setupProc.running) return
    setupProc.command = [webthemeScript, "setup"]
    setupProc.running = true
  }

  function assemble() {
    if (!webthemeScript || setupProc.running) return
    setupProc.command = [webthemeScript, "assemble"]
    setupProc.running = true
  }

  Process {
    id: setupProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var raw = String(text || "").trim()
        if (!raw) return
        try {
          var parsed = JSON.parse(raw)
          root.flagsChanged = parsed.flagsChanged === true
          if (parsed.sites !== undefined) root.siteCount = Number(parsed.sites) || 0
          root.lastError = ""
        } catch (e) {
          root.lastError = "could not parse webtheme setup"
        }
      }
    }
    stderr: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var err = String(text || "").trim()
        if (err) root.lastError = err
      }
    }
  }

  Component.onCompleted: root.setup()
}
