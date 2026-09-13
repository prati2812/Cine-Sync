package com.nightwatcher.video

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.RCTEventEmitter

@OptIn(UnstableApi::class)
@Suppress("DEPRECATION")
class CinePlayerView(context: Context) : FrameLayout(context), Player.Listener {

    private val playerView: PlayerView = PlayerView(context)
    private var exoPlayer: ExoPlayer? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var isPlayingRequested: Boolean = true
    private var currentUrl: String? = null

    private val progressRunnable = object : Runnable {
        override fun run() {
            exoPlayer?.let { player ->
                if (player.isPlaying) {
                    emitProgress()
                }
            }
            mainHandler.postDelayed(this, 300)
        }
    }

    init {
        // Setup PlayerView with zero default controls
        playerView.useController = false
        playerView.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
        val params = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        addView(playerView, params)

        initializePlayer()
    }

    private fun initializePlayer() {
        if (exoPlayer != null) return

        val player = ExoPlayer.Builder(context).build().apply {
            addListener(this@CinePlayerView)
            playWhenReady = isPlayingRequested
        }
        exoPlayer = player
        playerView.player = player
        mainHandler.post(progressRunnable)
    }

    fun setSourceUrl(url: String?) {
        if (url.isNullOrEmpty()) {
            currentUrl = null
            exoPlayer?.stop()
            exoPlayer?.clearMediaItems()
            return
        }

        if (url == currentUrl) return
        currentUrl = url

        initializePlayer()

        if (YouTubeExtractorHelper.isYouTubeUrl(url)) {
            // Inform listener that video is loading/buffering
            val bufferMap = Arguments.createMap().apply {
                putBoolean("isPlaying", false)
                putBoolean("isBuffering", true)
                putDouble("duration", 0.0)
                putDouble("currentTime", 0.0)
                putInt("playbackState", Player.STATE_BUFFERING)
            }
            emitEvent("onPlaybackStateChange", bufferMap)

            // Asynchronously resolve YouTube stream in background
            Thread {
                try {
                    val media = YouTubeExtractorHelper.extractMedia(url)
                    mainHandler.post {
                        if (currentUrl == url) {
                            loadExtractedMedia(media)
                        }
                    }
                } catch (e: Exception) {
                    Log.e("CinePlayerView", "Failed to extract YouTube stream: ${e.message}", e)
                    mainHandler.post {
                        if (currentUrl == url) {
                            val map = Arguments.createMap().apply {
                                putString("error", "YouTube stream extraction failed: ${e.message ?: "Unknown error"}")
                                putInt("errorCode", -101)
                            }
                            emitEvent("onError", map)
                        }
                    }
                }
            }.start()
        } else {
            // Direct streaming URL (HLS .m3u8, MP4, DASH, etc.)
            val isHls = url.contains(".m3u8", ignoreCase = true)
            loadExtractedMedia(ExtractedMedia.Single(Uri.parse(url), isHls = isHls))
        }
    }

    private fun loadExtractedMedia(media: ExtractedMedia) {
        val player = exoPlayer ?: return
        val dataSourceFactory = DefaultDataSource.Factory(context)

        when (media) {
            is ExtractedMedia.Single -> {
                val mediaItem = if (media.isHls) {
                    MediaItem.Builder()
                        .setUri(media.uri)
                        .setMimeType(MimeTypes.APPLICATION_M3U8)
                        .build()
                } else {
                    MediaItem.fromUri(media.uri)
                }
                player.setMediaItem(mediaItem)
            }
            is ExtractedMedia.Merged -> {
                val videoSource = ProgressiveMediaSource.Factory(dataSourceFactory)
                    .createMediaSource(MediaItem.fromUri(media.videoUri))
                val audioSource = ProgressiveMediaSource.Factory(dataSourceFactory)
                    .createMediaSource(MediaItem.fromUri(media.audioUri))
                val mergedSource = MergingMediaSource(videoSource, audioSource)
                player.setMediaSource(mergedSource)
            }
        }

        player.prepare()
        player.playWhenReady = isPlayingRequested
    }

    fun setPaused(paused: Boolean) {
        isPlayingRequested = !paused
        exoPlayer?.playWhenReady = isPlayingRequested
    }

    fun play() {
        isPlayingRequested = true
        exoPlayer?.playWhenReady = true
        exoPlayer?.play()
    }

    fun pause() {
        isPlayingRequested = false
        exoPlayer?.playWhenReady = false
        exoPlayer?.pause()
    }

    fun seekTo(positionMs: Long) {
        exoPlayer?.seekTo(positionMs)
    }

    fun setResizeMode(mode: String?) {
        playerView.resizeMode = when (mode?.lowercase()) {
            "cover" -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            "stretch" -> AspectRatioFrameLayout.RESIZE_MODE_FILL
            else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
        }
    }

    fun setVolume(volume: Float) {
        exoPlayer?.volume = volume.coerceIn(0f, 1f)
    }

    // ── Player.Listener Callbacks ──

    override fun onPlaybackStateChanged(playbackState: Int) {
        val player = exoPlayer ?: return
        val isBuffering = playbackState == Player.STATE_BUFFERING
        val isEnded = playbackState == Player.STATE_ENDED

        val map = Arguments.createMap().apply {
            putBoolean("isPlaying", player.isPlaying)
            putBoolean("isBuffering", isBuffering)
            putDouble("duration", if (player.duration != C.TIME_UNSET) player.duration / 1000.0 else 0.0)
            putDouble("currentTime", player.currentPosition / 1000.0)
            putInt("playbackState", playbackState)
        }
        emitEvent("onPlaybackStateChange", map)

        if (isEnded) {
            emitEvent("onEnd", Arguments.createMap())
        }
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        val player = exoPlayer ?: return
        val map = Arguments.createMap().apply {
            putBoolean("isPlaying", isPlaying)
            putBoolean("isBuffering", player.playbackState == Player.STATE_BUFFERING)
            putDouble("currentTime", player.currentPosition / 1000.0)
            putDouble("duration", if (player.duration != C.TIME_UNSET) player.duration / 1000.0 else 0.0)
        }
        emitEvent("onPlaybackStateChange", map)
    }

    override fun onPlayerError(error: PlaybackException) {
        Log.e("CinePlayerView", "ExoPlayer error: ${error.message}", error)
        val map = Arguments.createMap().apply {
            putString("error", error.message ?: "Unknown ExoPlayer playback error")
            putInt("errorCode", error.errorCode)
        }
        emitEvent("onError", map)
    }

    private fun emitProgress() {
        val player = exoPlayer ?: return
        val durationSecs = if (player.duration != C.TIME_UNSET) player.duration / 1000.0 else 0.0
        val currentSecs = player.currentPosition / 1000.0

        val map = Arguments.createMap().apply {
            putDouble("currentTime", currentSecs)
            putDouble("duration", durationSecs)
            putDouble("bufferedPosition", player.bufferedPosition / 1000.0)
        }
        emitEvent("onProgress", map)
    }

    private fun emitEvent(eventName: String, eventData: WritableMap) {
        val reactContext = context as? ReactContext ?: return
        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(
            id,
            eventName,
            eventData
        )
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        releasePlayer()
    }

    fun releasePlayer() {
        mainHandler.removeCallbacks(progressRunnable)
        exoPlayer?.let { player ->
            player.removeListener(this)
            player.release()
        }
        exoPlayer = null
        playerView.player = null
    }
}
