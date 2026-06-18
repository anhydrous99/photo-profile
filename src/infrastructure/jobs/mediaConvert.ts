import {
  MediaConvertClient,
  CreateJobCommand,
  type CreateJobCommandInput,
} from "@aws-sdk/client-mediaconvert";
import { env } from "@/infrastructure/config/env";
import {
  HLS_AUDIO_BITRATE,
  HLS_RENDITIONS,
  HLS_SEGMENT_SECONDS,
} from "@/lib/constants";

/**
 * Submits AWS Elemental MediaConvert jobs that transcode an uploaded original
 * into adaptive-bitrate HLS plus a poster frame.
 *
 * Outputs are written under processed/{photoId}/ so they are served by the same
 * CloudFront/OAC origin as image derivatives:
 *   - processed/{photoId}/hls/master.m3u8 (+ variant playlists & segments)
 *   - processed/{photoId}/poster/poster.0000000.jpg (single frame capture)
 *
 * The job carries UserMetadata.photoId so the EventBridge completion handler
 * can map the job result back to the Photo record.
 */

let _client: MediaConvertClient | null = null;

function getMediaConvertClient(): MediaConvertClient {
  if (!_client) {
    _client = new MediaConvertClient({
      region: env.AWS_REGION,
      ...(env.AWS_MEDIACONVERT_ENDPOINT
        ? { endpoint: env.AWS_MEDIACONVERT_ENDPOINT }
        : {}),
    });
  }
  return _client;
}

const MAX_ABR_BITRATE = Math.max(...HLS_RENDITIONS.map((r) => r.bitrate));

/**
 * Builds the MediaConvert CreateJob input. Pure function (no AWS calls) so the
 * job shape can be unit-tested.
 */
export function buildTranscodeJobInput(params: {
  photoId: string;
  originalKey: string;
  bucket: string;
  roleArn: string;
}): CreateJobCommandInput {
  const { photoId, originalKey, bucket, roleArn } = params;

  // Trailing base name ("master"/"poster") controls output file naming:
  //   master.m3u8, master_1.m3u8, ...   and   poster.0000000.jpg
  const hlsDestination = `s3://${bucket}/processed/${photoId}/hls/master`;
  const posterDestination = `s3://${bucket}/processed/${photoId}/poster/poster`;

  return {
    Role: roleArn,
    // Surfaced on the job-state-change event for correlation.
    UserMetadata: { photoId },
    Settings: {
      TimecodeConfig: { Source: "ZEROBASED" },
      Inputs: [
        {
          FileInput: `s3://${bucket}/${originalKey}`,
          TimecodeSource: "ZEROBASED",
          AudioSelectors: {
            "Audio Selector 1": { DefaultSelection: "DEFAULT" },
          },
          VideoSelector: {},
        },
      ],
      OutputGroups: [
        {
          Name: "Apple HLS",
          // Automated ABR builds an optimal ladder capped at the source
          // resolution/bitrate, so small sources are never upscaled.
          AutomatedEncodingSettings: {
            AbrSettings: {
              MaxAbrBitrate: MAX_ABR_BITRATE,
              MaxRenditions: HLS_RENDITIONS.length,
            },
          },
          OutputGroupSettings: {
            Type: "HLS_GROUP_SETTINGS",
            HlsGroupSettings: {
              Destination: hlsDestination,
              SegmentLength: HLS_SEGMENT_SECONDS,
              MinSegmentLength: 0,
            },
          },
          Outputs: [
            {
              VideoDescription: {
                CodecSettings: {
                  Codec: "H_264",
                  H264Settings: {
                    RateControlMode: "QVBR",
                    QvbrSettings: { QvbrQualityLevel: 7 },
                    QualityTuningLevel: "SINGLE_PASS_HQ",
                    SceneChangeDetect: "TRANSITION_DETECTION",
                  },
                },
              },
              AudioDescriptions: [
                {
                  CodecSettings: {
                    Codec: "AAC",
                    AacSettings: {
                      Bitrate: HLS_AUDIO_BITRATE,
                      CodingMode: "CODING_MODE_2_0",
                      SampleRate: 48000,
                    },
                  },
                },
              ],
              OutputSettings: { HlsSettings: {} },
              ContainerSettings: { Container: "M3U8", M3u8Settings: {} },
            },
          ],
        },
        {
          Name: "Poster",
          OutputGroupSettings: {
            Type: "FILE_GROUP_SETTINGS",
            FileGroupSettings: { Destination: posterDestination },
          },
          Outputs: [
            {
              VideoDescription: {
                CodecSettings: {
                  Codec: "FRAME_CAPTURE",
                  FrameCaptureSettings: {
                    FramerateNumerator: 1,
                    FramerateDenominator: 1,
                    MaxCaptures: 1,
                    Quality: 80,
                  },
                },
              },
              ContainerSettings: { Container: "RAW" },
            },
          ],
        },
      ],
    },
  };
}

/**
 * Submits a transcode job for an uploaded video. Returns the MediaConvert job
 * id. Throws if video transcoding is not fully configured.
 */
export async function submitVideoTranscode(params: {
  photoId: string;
  originalKey: string;
}): Promise<string> {
  const { photoId, originalKey } = params;

  if (!env.AWS_S3_BUCKET) {
    throw new Error("AWS_S3_BUCKET is not configured for video transcoding");
  }
  if (!env.AWS_MEDIACONVERT_ROLE_ARN) {
    throw new Error(
      "AWS_MEDIACONVERT_ROLE_ARN is not configured for video transcoding",
    );
  }

  const input = buildTranscodeJobInput({
    photoId,
    originalKey,
    bucket: env.AWS_S3_BUCKET,
    roleArn: env.AWS_MEDIACONVERT_ROLE_ARN,
  });

  const result = await getMediaConvertClient().send(
    new CreateJobCommand(input),
  );
  const jobId = result.Job?.Id;
  if (!jobId) {
    throw new Error("MediaConvert did not return a job id");
  }
  return jobId;
}
