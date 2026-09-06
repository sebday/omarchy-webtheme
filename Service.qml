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
    onStarted: { stdoutBuf = ""; stderrBuf = "" }

    property string stdoutBuf: ""
    property string stderrBuf: ""
    stdout: SplitParser {
      splitMarker: ""
      onRead: function(chunk) {
        setupProc.stdoutBuf += chunk
        if (setupProc.stdoutBuf.length > 262144) {
          setupProc.signal(15)
          setupProc.stdoutBuf = ""
        }
      }
    }
    stderr: SplitParser {
      splitMarker: ""
      onRead: function(chunk) {
        setupProc.stderrBuf += chunk
        if (setupProc.stderrBuf.length > 4096) {
          setupProc.signal(15)
          setupProc.stderrBuf = ""
        }
      }
    }
      onExited: function(exitCode) {
      var raw = String(stdoutBuf || "").trim()
        if (!raw) return
        try {
          var parsed = JSON.parse(raw)
          root.flagsChanged = parsed.flagsChanged === true
          if (parsed.sites !== undefined) root.siteCount = Number(parsed.sites) || 0
          root.lastError = ""
        } catch (e) {
          root.lastError = "could not parse webtheme setup"
        }
      var err = String(stderrBuf || "").trim()
        if (err) root.lastError = err
    }
  }

  Component.onCompleted: {}
}
