import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "evo.webtheme"
  ipcTarget: "evo.webtheme"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  readonly property color foreground: Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color accent: Color.accent
  readonly property color dim: Qt.darker(foreground, 1.4)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property string webthemeScript: Qt.resolvedUrl("bin/webtheme").toString().replace("file://", "")

  property var sites: []
  property bool loading: false
  property bool saving: false
  property bool globalEnabled: true
  property string statusText: ""
  property real shownEnabled: 0

  readonly property var bundledSites: Model.bundledSites(sites)
  readonly property var mineSites: Model.mineSites(sites)
  readonly property int enabledSites: Model.enabledCount(sites)
  readonly property int bundledCount: bundledSites.length
  readonly property int mineCount: mineSites.length
  readonly property bool iconError: !!statusText && statusText.indexOf("webtheme:") === 0
  readonly property bool iconBusy: loading || saving
  readonly property bool iconMuted: !loading && (!globalEnabled || enabledSites === 0)
  readonly property string barTooltip: !globalEnabled
    ? "Paused"
    : (enabledSites + " site" + (enabledSites === 1 ? "" : "s") + " themed")
  readonly property string heroMeta: !globalEnabled ? "Paused" : "sites themed"

  Behavior on shownEnabled {
    enabled: !root.loading
    NumberAnimation { duration: 420; easing.type: Easing.OutCubic }
  }

  function refresh() {
    if (!webthemeScript || listProc.running) return
    loading = true
    listProc.command = [webthemeScript, "list"]
    listProc.running = true
  }

  function toggleGlobal() {
    if (!webthemeScript || globalProc.running) return
    globalEnabled = !globalEnabled
    saving = true
    globalProc.command = [webthemeScript, "enabled", globalEnabled ? "true" : "false"]
    globalProc.running = true
  }

  function openFromHotkey() {
    root.controller.show()
    root.refresh()
  }

  function runSetup() {
    if (!webthemeScript || setupProc.running) return
    loading = true
    setupProc.command = [webthemeScript, "setup"]
    setupProc.running = true
  }

  function toggle() {
    if (root.opened) root.close()
    else root.openFromHotkey()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  Component.onCompleted: refresh()

  onOpenedChanged: {
    if (opened) {
      refresh()
      Qt.callLater(function() { keyCatcher.forceActiveFocus() })
    }
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
      var err = String(stderrBuf || "").trim()
      if (err) root.statusText = Model.plain(err)
      root.loading = false
      root.refresh()
    }
  }

  Process {
    id: listProc
    onStarted: { stdoutBuf = ""; stderrBuf = "" }

    property string stdoutBuf: ""
    property string stderrBuf: ""
    stdout: SplitParser {
      splitMarker: ""
      onRead: function(chunk) {
        listProc.stdoutBuf += chunk
        if (listProc.stdoutBuf.length > 262144) {
          listProc.signal(15)
          listProc.stdoutBuf = ""
        }
      }
    }
    stderr: SplitParser {
      splitMarker: ""
      onRead: function(chunk) {
        listProc.stderrBuf += chunk
        if (listProc.stderrBuf.length > 4096) {
          listProc.signal(15)
          listProc.stderrBuf = ""
        }
      }
    }
    onExited: function(exitCode) {
      var catalog = Model.parseCatalog(stdoutBuf)
        root.sites = catalog.sites
        root.globalEnabled = catalog.enabled !== false
        root.shownEnabled = catalog.enabled === false ? 0 : Model.enabledCount(catalog.sites)
        root.loading = false
      var err = String(stderrBuf || "").trim()
        if (err) root.statusText = err
        root.loading = false
      root.loading = false
    }
  }

  Process {
    id: globalProc
    onStarted: { stdoutBuf = ""; stderrBuf = "" }

    property string stdoutBuf: ""
    property string stderrBuf: ""
    stdout: SplitParser {
      splitMarker: ""
      onRead: function(chunk) {
        globalProc.stdoutBuf += chunk
        if (globalProc.stdoutBuf.length > 262144) {
          globalProc.signal(15)
          globalProc.stdoutBuf = ""
        }
      }
    }
    stderr: SplitParser {
      splitMarker: ""
      onRead: function(chunk) {
        globalProc.stderrBuf += chunk
        if (globalProc.stderrBuf.length > 4096) {
          globalProc.signal(15)
          globalProc.stderrBuf = ""
        }
      }
    }
    onExited: function(exitCode) {
      root.saving = false
        root.statusText = ""
        root.refresh()
      var err = String(stderrBuf || "").trim()
        if (err) root.statusText = err
        root.saving = false
        root.refresh()
      root.saving = false
    }
  }

  IpcHandler {
    target: root.ipcTarget

    function open(): void { root.openFromHotkey() }
    function close(): void { root.close() }
    function show(): void { root.openFromHotkey() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): string { root.refresh(); return "ok" }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(420))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(420))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Column {
        id: column
        width: parent.width
        spacing: Style.space(12)

        PanelHero {
          id: hero
          width: parent.width
          title: "Webtheme"
          meta: root.loading ? "Loading…" : root.heroMeta
          detail: root.statusText
          foreground: root.foreground
          fontFamily: root.fontFamily
          iconOpacity: root.globalEnabled ? 1.0 : 0.5

          iconComponent: Component {
            Text {
              textFormat: Text.PlainText
              text: "󰸌"
              color: root.accent
              font.family: root.fontFamily
              font.pixelSize: Style.font.display
            }
          }

          trailingControl: Component {
            CountBadge {
              loading: root.loading
              value: root.shownEnabled
              fillColor: root.globalEnabled ? root.accent : root.dim
              fontFamily: root.fontFamily
            }
          }
        }

        Row {
          visible: !root.loading
          width: parent.width
          spacing: Style.space(8)

          StatTile {
            width: (parent.width - parent.spacing * 3) / 4
            animatedValue: root.enabledSites
            label: "enabled"
            valueColor: root.globalEnabled ? root.accent : root.dim
          }

          StatTile {
            width: (parent.width - parent.spacing * 3) / 4
            animatedValue: root.bundledCount
            label: "bundled"
          }

          StatTile {
            width: (parent.width - parent.spacing * 3) / 4
            animatedValue: root.mineCount
            label: "mine"
          }

          StatTile {
            width: (parent.width - parent.spacing * 3) / 4
            animatedValue: root.sites.length
            label: "total"
          }
        }

        Toggle {
          width: parent.width
          visible: !root.loading
          label: "Theming"
          description: root.globalEnabled ? "Pause all site CSS" : "Theming is paused"
          checked: root.globalEnabled
          foreground: root.foreground
          accent: root.accent
          fontFamily: root.fontFamily
          onClicked: root.toggleGlobal()
        }

        Text {
          textFormat: Text.PlainText
          width: parent.width
          visible: !root.loading
          text: "Manage sites from the Brave or Chromium toolbar extension."
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.WordWrap
        }

        Text {
          textFormat: Text.PlainText
          width: parent.width
          visible: !root.loading
          text: "Install browser integration"
          color: root.accent
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            onClicked: root.runSetup()
          }
        }
      }
    }
  }

  component CountBadge: Rectangle {
    id: badge
    property bool loading: false
    property real value: 0
    property color fillColor: Color.accent
    property string fontFamily: Style.font.family

    readonly property int rounded: Math.round(value)

    implicitWidth: countText.implicitWidth + Style.spacing.lg * 2
    implicitHeight: countText.implicitHeight + Style.spacing.sm * 2
    radius: implicitHeight / 2
    color: Qt.rgba(fillColor.r, fillColor.g, fillColor.b, 0.14)

    Text {
      textFormat: Text.PlainText
      id: countText
      anchors.centerIn: parent
      text: parent.loading ? "…" : String(parent.rounded)
      color: parent.fillColor
      font.family: parent.fontFamily
      font.pixelSize: Style.font.displayLarge
      font.bold: true
    }
  }

  component StatTile: BorderSurface {
    id: tile
    property string label: ""
    property color valueColor: root.accent
    property real animatedValue: 0

    implicitHeight: tileColumn.implicitHeight + Style.spacing.lg * 2
    color: Color.popups.background
    borderSpec: Border.surfaceSpec("popups", "border", Color.popups.border, 1)
    radius: Style.cornerRadius

    Column {
      id: tileColumn
      anchors.centerIn: parent
      width: parent.width - Style.spacing.lg * 2
      spacing: Style.spacing.labelGap

      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: String(Math.round(tile.animatedValue))
        color: tile.valueColor
        font.family: root.fontFamily
        font.pixelSize: Style.font.title
        font.bold: true
        horizontalAlignment: Text.AlignHCenter
        elide: Text.ElideRight
      }

      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: tile.label
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        horizontalAlignment: Text.AlignHCenter
        elide: Text.ElideRight
      }
    }
  }
}
