package com.nightwatcher.video

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

@Suppress("DEPRECATION")
class CinePlayerViewManager : SimpleViewManager<CinePlayerView>() {

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(reactContext: ThemedReactContext): CinePlayerView {
        return CinePlayerView(reactContext)
    }

    override fun onDropViewInstance(view: CinePlayerView) {
        super.onDropViewInstance(view)
        view.releasePlayer()
    }

    @ReactProp(name = "url")
    fun setUrl(view: CinePlayerView, url: String?) {
        view.setSourceUrl(url)
    }

    @ReactProp(name = "paused")
    fun setPaused(view: CinePlayerView, paused: Boolean) {
        view.setPaused(paused)
    }

    @ReactProp(name = "resizeMode")
    fun setResizeMode(view: CinePlayerView, mode: String?) {
        view.setResizeMode(mode)
    }

    @ReactProp(name = "volume", defaultFloat = 1.0f)
    fun setVolume(view: CinePlayerView, volume: Float) {
        view.setVolume(volume)
    }

    override fun getCommandsMap(): Map<String, Int> {
        return mapOf(
            "play" to COMMAND_PLAY,
            "pause" to COMMAND_PAUSE,
            "seekTo" to COMMAND_SEEK_TO
        )
    }

    override fun receiveCommand(view: CinePlayerView, commandId: Int, args: ReadableArray?) {
        when (commandId) {
            COMMAND_PLAY -> view.play()
            COMMAND_PAUSE -> view.pause()
            COMMAND_SEEK_TO -> {
                val positionSeconds = args?.getDouble(0) ?: 0.0
                view.seekTo((positionSeconds * 1000).toLong())
            }
            else -> super.receiveCommand(view, commandId, args)
        }
    }

    override fun receiveCommand(view: CinePlayerView, commandId: String, args: ReadableArray?) {
        when (commandId) {
            "play" -> view.play()
            "pause" -> view.pause()
            "seekTo" -> {
                val positionSeconds = args?.getDouble(0) ?: 0.0
                view.seekTo((positionSeconds * 1000).toLong())
            }
            else -> super.receiveCommand(view, commandId, args)
        }
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any>? {
        val base = super.getExportedCustomDirectEventTypeConstants() ?: mutableMapOf()
        base["onProgress"] = MapBuilder.of("registrationName", "onProgress")
        base["onPlaybackStateChange"] = MapBuilder.of("registrationName", "onPlaybackStateChange")
        base["onEnd"] = MapBuilder.of("registrationName", "onEnd")
        base["onError"] = MapBuilder.of("registrationName", "onError")
        return base
    }

    companion object {
        const val REACT_CLASS = "CineNativePlayerView"
        const val COMMAND_PLAY = 1
        const val COMMAND_PAUSE = 2
        const val COMMAND_SEEK_TO = 3
    }
}
