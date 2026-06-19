import { describe, it, expect } from "vitest";
import {
  buildDefaultMediaConvertRoleArn,
  buildTranscodeJobInput,
} from "../mediaConvert";

describe("buildTranscodeJobInput", () => {
  const input = buildTranscodeJobInput({
    photoId: "vid-1",
    originalKey: "originals/vid-1/original.mp4",
    bucket: "my-bucket",
    roleArn: "arn:aws:iam::123456789:role/mc",
  });

  it("sets the MediaConvert role", () => {
    expect(input.Role).toBe("arn:aws:iam::123456789:role/mc");
  });

  it("tags the job with the photoId for completion correlation", () => {
    expect(input.UserMetadata).toEqual({ photoId: "vid-1" });
  });

  it("points the input at the original S3 object", () => {
    expect(input.Settings?.Inputs?.[0]?.FileInput).toBe(
      "s3://my-bucket/originals/vid-1/original.mp4",
    );
  });

  it("produces an HLS output group with automated ABR and master destination", () => {
    const groups = input.Settings?.OutputGroups ?? [];
    const hls = groups.find(
      (g) => g.OutputGroupSettings?.Type === "HLS_GROUP_SETTINGS",
    );
    expect(hls).toBeDefined();
    expect(
      hls?.AutomatedEncodingSettings?.AbrSettings?.MaxRenditions,
    ).toBeGreaterThan(0);
    expect(hls?.OutputGroupSettings?.HlsGroupSettings?.Destination).toBe(
      "s3://my-bucket/processed/vid-1/hls/master",
    );
  });

  it("uses H.264 QVBR with multi-pass quality for automated ABR", () => {
    const groups = input.Settings?.OutputGroups ?? [];
    const hls = groups.find(
      (g) => g.OutputGroupSettings?.Type === "HLS_GROUP_SETTINGS",
    );
    const codec = hls?.Outputs?.[0]?.VideoDescription?.CodecSettings?.Codec;
    const rateControl =
      hls?.Outputs?.[0]?.VideoDescription?.CodecSettings?.H264Settings
        ?.RateControlMode;
    const qualityTuningLevel =
      hls?.Outputs?.[0]?.VideoDescription?.CodecSettings?.H264Settings
        ?.QualityTuningLevel;
    expect(codec).toBe("H_264");
    expect(rateControl).toBe("QVBR");
    expect(qualityTuningLevel).toBe("MULTI_PASS_HQ");
  });

  it("produces a poster frame-capture output group", () => {
    const groups = input.Settings?.OutputGroups ?? [];
    const poster = groups.find(
      (g) => g.OutputGroupSettings?.Type === "FILE_GROUP_SETTINGS",
    );
    expect(poster?.OutputGroupSettings?.FileGroupSettings?.Destination).toBe(
      "s3://my-bucket/processed/vid-1/poster/poster",
    );
    expect(poster?.Outputs?.[0]?.VideoDescription?.CodecSettings?.Codec).toBe(
      "FRAME_CAPTURE",
    );
    expect(
      poster?.Outputs?.[0]?.VideoDescription?.CodecSettings
        ?.FrameCaptureSettings?.MaxCaptures,
    ).toBe(1);
  });
});

describe("buildDefaultMediaConvertRoleArn", () => {
  it("builds the CDK-managed MediaConvert role ARN for standard AWS regions", () => {
    expect(
      buildDefaultMediaConvertRoleArn({
        accountId: "123456789012",
        region: "us-east-2",
      }),
    ).toBe("arn:aws:iam::123456789012:role/PhotoProfileMediaConvertRole");
  });

  it("uses the AWS China partition for cn regions", () => {
    expect(
      buildDefaultMediaConvertRoleArn({
        accountId: "123456789012",
        region: "cn-north-1",
      }),
    ).toBe("arn:aws-cn:iam::123456789012:role/PhotoProfileMediaConvertRole");
  });
});
