package com.nightwatcher.video

import android.net.Uri
import android.util.Log
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request as OkHttpRequest
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.stream.StreamInfo
import java.io.IOException
import java.util.concurrent.TimeUnit

sealed class ExtractedMedia {
    data class Single(val uri: Uri, val isHls: Boolean = false) : ExtractedMedia()
    data class Merged(val videoUri: Uri, val audioUri: Uri) : ExtractedMedia()
}

class OkHttpDownloader(private val client: OkHttpClient) : Downloader() {
    override fun execute(request: Request): Response {
        val httpMethod = request.httpMethod()
        val dataToSend = request.dataToSend()

        val requestBody = if (httpMethod.equals("POST", ignoreCase = true) || httpMethod.equals("PUT", ignoreCase = true)) {
            dataToSend?.toRequestBody(null) ?: ByteArray(0).toRequestBody(null)
        } else {
            null
        }

        val builder = OkHttpRequest.Builder()
            .url(request.url())
            .method(httpMethod, requestBody)

        request.headers().forEach { (key, values) ->
            values.forEach { builder.addHeader(key, it) }
        }

        Log.d("OkHttpDownloader", "Fetching URL: ${request.url()} [${httpMethod}]")
        val response = client.newCall(builder.build()).execute()
        val responseBody = response.body?.string() ?: ""
        val headers = response.headers.toMultimap()
        Log.d("OkHttpDownloader", "Response ${response.code} for ${request.url()}, body length: ${responseBody.length}")
        if (responseBody.contains("The page needs to be reloaded") || responseBody.contains("reload")) {
            Log.d("OkHttpDownloader", "Found reload in body: ${responseBody.take(500)}")
        }

        return Response(
            response.code,
            response.message,
            headers,
            responseBody,
            response.request.url.toString()
        )
    }
}

object YouTubeExtractorHelper {
    private const val TAG = "CineYouTubeExtractor"
    private var isInitialized = false

    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    @Synchronized
    fun init() {
        if (!isInitialized) {
            NewPipe.init(OkHttpDownloader(okHttpClient))
            isInitialized = true
        }
    }

    fun isYouTubeUrl(rawUrl: String?): Boolean {
        if (rawUrl == null) return false
        val lower = rawUrl.trim().lowercase()
        return lower.contains("youtube.com") || lower.contains("youtu.be") || (!lower.contains("/") && lower.length in 10..12)
    }

    fun normalizeYouTubeUrl(rawUrl: String): String {
        val trimmed = rawUrl.trim()
        if (!trimmed.contains("http://") && !trimmed.contains("https://")) {
            // It might be an 11-character video ID like "aqz-KE-bpKQ"
            if (!trimmed.contains("/") && trimmed.length in 10..12) {
                return "https://www.youtube.com/watch?v=$trimmed"
            }
        }
        return trimmed
    }

    fun extractMedia(rawUrl: String): ExtractedMedia {
        val url = normalizeYouTubeUrl(rawUrl)
        if (!isYouTubeUrl(url)) {
            val isHls = url.contains(".m3u8", ignoreCase = true)
            return ExtractedMedia.Single(Uri.parse(url), isHls = isHls)
        }

        init()
        val streamInfo = StreamInfo.getInfo(url)

        // 1. Prefer HLS playlist if available (adaptive multi-bitrate)
        val hls = streamInfo.hlsUrl
        if (!hls.isNullOrEmpty()) {
            Log.d(TAG, "Selected YouTube HLS stream: $hls")
            return ExtractedMedia.Single(Uri.parse(hls), isHls = true)
        }

        // 2. Combined progressive streams (audio + video muxed together)
        val muxedStreams = streamInfo.videoStreams
        if (!muxedStreams.isNullOrEmpty()) {
            // Pick highest quality (e.g. 720p or 1080p if available)
            val bestMuxed = muxedStreams.maxByOrNull { stream ->
                stream.resolution?.filter { it.isDigit() }?.toIntOrNull() ?: 0
            } ?: muxedStreams[0]
            Log.d(TAG, "Selected YouTube progressive muxed stream: ${bestMuxed.content}")
            return ExtractedMedia.Single(Uri.parse(bestMuxed.content), isHls = false)
        }

        // 3. Fallback: Merged video-only and audio-only streams
        val videoOnly = streamInfo.videoOnlyStreams
        val audioOnly = streamInfo.audioStreams
        if (!videoOnly.isNullOrEmpty() && !audioOnly.isNullOrEmpty()) {
            val bestVideo = videoOnly.maxByOrNull { stream ->
                stream.resolution?.filter { it.isDigit() }?.toIntOrNull() ?: 0
            } ?: videoOnly[0]
            val bestAudio = audioOnly.maxByOrNull { it.averageBitrate } ?: audioOnly[0]
            Log.d(TAG, "Selected YouTube merged streams: video=${bestVideo.content}, audio=${bestAudio.content}")
            return ExtractedMedia.Merged(Uri.parse(bestVideo.content), Uri.parse(bestAudio.content))
        }

        throw IOException("No playable video stream found for $url")
    }
}
