"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) =>
  function __require() {
    return (
      mod ||
        (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod),
      mod.exports
    );
  };
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === "object") || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, {
          get: () => from[key],
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
        });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (
  (target = mod != null ? __create(__getProtoOf(mod)) : {}),
  __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule
      ? __defProp(target, "default", { value: mod, enumerable: true })
      : target,
    mod,
  )
);
var __toCommonJS = (mod) =>
  __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/exif-reader/tags.js
var require_tags = __commonJS({
  "node_modules/exif-reader/tags.js"(exports2) {
    exports2.Image = {
      11: "ProcessingSoftware",
      254: "NewSubfileType",
      255: "SubfileType",
      256: "ImageWidth",
      257: "ImageLength",
      258: "BitsPerSample",
      259: "Compression",
      262: "PhotometricInterpretation",
      263: "Thresholding",
      264: "CellWidth",
      265: "CellLength",
      266: "FillOrder",
      269: "DocumentName",
      270: "ImageDescription",
      271: "Make",
      272: "Model",
      273: "StripOffsets",
      274: "Orientation",
      277: "SamplesPerPixel",
      278: "RowsPerStrip",
      279: "StripByteCounts",
      282: "XResolution",
      283: "YResolution",
      284: "PlanarConfiguration",
      285: "PageName",
      286: "XPosition",
      287: "YPosition",
      290: "GrayResponseUnit",
      291: "GrayResponseCurve",
      292: "T4Options",
      293: "T6Options",
      296: "ResolutionUnit",
      297: "PageNumber",
      301: "TransferFunction",
      305: "Software",
      306: "DateTime",
      315: "Artist",
      316: "HostComputer",
      317: "Predictor",
      318: "WhitePoint",
      319: "PrimaryChromaticities",
      320: "ColorMap",
      321: "HalftoneHints",
      322: "TileWidth",
      323: "TileLength",
      324: "TileOffsets",
      325: "TileByteCounts",
      330: "SubIFDs",
      332: "InkSet",
      333: "InkNames",
      334: "NumberOfInks",
      336: "DotRange",
      337: "TargetPrinter",
      338: "ExtraSamples",
      339: "SampleFormat",
      340: "SMinSampleValue",
      341: "SMaxSampleValue",
      342: "TransferRange",
      343: "ClipPath",
      344: "XClipPathUnits",
      345: "YClipPathUnits",
      346: "Indexed",
      347: "JPEGTables",
      351: "OPIProxy",
      512: "JPEGProc",
      513: "JPEGInterchangeFormat",
      514: "JPEGInterchangeFormatLength",
      515: "JPEGRestartInterval",
      517: "JPEGLosslessPredictors",
      518: "JPEGPointTransforms",
      519: "JPEGQTables",
      520: "JPEGDCTables",
      521: "JPEGACTables",
      529: "YCbCrCoefficients",
      530: "YCbCrSubSampling",
      531: "YCbCrPositioning",
      532: "ReferenceBlackWhite",
      700: "XMLPacket",
      18246: "Rating",
      18249: "RatingPercent",
      28722: "VignettingCorrParams",
      28725: "ChromaticAberrationCorrParams",
      28727: "DistortionCorrParams",
      32781: "ImageID",
      33421: "CFARepeatPatternDim",
      33422: "CFAPattern",
      33423: "BatteryLevel",
      33432: "Copyright",
      33434: "ExposureTime",
      33437: "FNumber",
      33723: "IPTCNAA",
      34377: "ImageResources",
      34665: "ExifTag",
      34675: "InterColorProfile",
      34850: "ExposureProgram",
      34852: "SpectralSensitivity",
      34853: "GPSTag",
      34855: "ISOSpeedRatings",
      34856: "OECF",
      34857: "Interlace",
      34858: "TimeZoneOffset",
      34859: "SelfTimerMode",
      36867: "DateTimeOriginal",
      37122: "CompressedBitsPerPixel",
      37377: "ShutterSpeedValue",
      37378: "ApertureValue",
      37379: "BrightnessValue",
      37380: "ExposureBiasValue",
      37381: "MaxApertureValue",
      37382: "SubjectDistance",
      37383: "MeteringMode",
      37384: "LightSource",
      37385: "Flash",
      37386: "FocalLength",
      37387: "FlashEnergy",
      37388: "SpatialFrequencyResponse",
      37389: "Noise",
      37390: "FocalPlaneXResolution",
      37391: "FocalPlaneYResolution",
      37392: "FocalPlaneResolutionUnit",
      37393: "ImageNumber",
      37394: "SecurityClassification",
      37395: "ImageHistory",
      37396: "SubjectLocation",
      37397: "ExposureIndex",
      37398: "TIFFEPStandardID",
      37399: "SensingMethod",
      40091: "XPTitle",
      40092: "XPComment",
      40093: "XPAuthor",
      40094: "XPKeywords",
      40095: "XPSubject",
      50341: "PrintImageMatching",
      50706: "DNGVersion",
      50707: "DNGBackwardVersion",
      50708: "UniqueCameraModel",
      50709: "LocalizedCameraModel",
      50710: "CFAPlaneColor",
      50711: "CFALayout",
      50712: "LinearizationTable",
      50713: "BlackLevelRepeatDim",
      50714: "BlackLevel",
      50715: "BlackLevelDeltaH",
      50716: "BlackLevelDeltaV",
      50717: "WhiteLevel",
      50718: "DefaultScale",
      50719: "DefaultCropOrigin",
      50720: "DefaultCropSize",
      50721: "ColorMatrix1",
      50722: "ColorMatrix2",
      50723: "CameraCalibration1",
      50724: "CameraCalibration2",
      50725: "ReductionMatrix1",
      50726: "ReductionMatrix2",
      50727: "AnalogBalance",
      50728: "AsShotNeutral",
      50729: "AsShotWhiteXY",
      50730: "BaselineExposure",
      50731: "BaselineNoise",
      50732: "BaselineSharpness",
      50733: "BayerGreenSplit",
      50734: "LinearResponseLimit",
      50735: "CameraSerialNumber",
      50736: "LensInfo",
      50737: "ChromaBlurRadius",
      50738: "AntiAliasStrength",
      50739: "ShadowScale",
      50740: "DNGPrivateData",
      50741: "MakerNoteSafety",
      50778: "CalibrationIlluminant1",
      50779: "CalibrationIlluminant2",
      50780: "BestQualityScale",
      50781: "RawDataUniqueID",
      50827: "OriginalRawFileName",
      50828: "OriginalRawFileData",
      50829: "ActiveArea",
      50830: "MaskedAreas",
      50831: "AsShotICCProfile",
      50832: "AsShotPreProfileMatrix",
      50833: "CurrentICCProfile",
      50834: "CurrentPreProfileMatrix",
      50879: "ColorimetricReference",
      50931: "CameraCalibrationSignature",
      50932: "ProfileCalibrationSignature",
      50933: "ExtraCameraProfiles",
      50934: "AsShotProfileName",
      50935: "NoiseReductionApplied",
      50936: "ProfileName",
      50937: "ProfileHueSatMapDims",
      50938: "ProfileHueSatMapData1",
      50939: "ProfileHueSatMapData2",
      50940: "ProfileToneCurve",
      50941: "ProfileEmbedPolicy",
      50942: "ProfileCopyright",
      50964: "ForwardMatrix1",
      50965: "ForwardMatrix2",
      50966: "PreviewApplicationName",
      50967: "PreviewApplicationVersion",
      50968: "PreviewSettingsName",
      50969: "PreviewSettingsDigest",
      50970: "PreviewColorSpace",
      50971: "PreviewDateTime",
      50972: "RawImageDigest",
      50973: "OriginalRawFileDigest",
      50974: "SubTileBlockSize",
      50975: "RowInterleaveFactor",
      50981: "ProfileLookTableDims",
      50982: "ProfileLookTableData",
      51008: "OpcodeList1",
      51009: "OpcodeList2",
      51022: "OpcodeList3",
      51041: "NoiseProfile",
      51043: "TimeCodes",
      51044: "FrameRate",
      51058: "TStop",
      51081: "ReelName",
      51105: "CameraLabel",
      51089: "OriginalDefaultFinalSize",
      51090: "OriginalBestQualityFinalSize",
      51091: "OriginalDefaultCropSize",
      51107: "ProfileHueSatMapEncoding",
      51108: "ProfileLookTableEncoding",
      51109: "BaselineExposureOffset",
      51110: "DefaultBlackRender",
      51111: "NewRawImageDigest",
      51112: "RawToPreviewGain",
      51125: "DefaultUserCrop",
      51177: "DepthFormat",
      51178: "DepthNear",
      51179: "DepthFar",
      51180: "DepthUnits",
      51181: "DepthMeasureType",
      51182: "EnhanceParams",
      52525: "ProfileGainTableMap",
      52526: "SemanticName",
      52528: "SemanticInstanceID",
      52529: "CalibrationIlluminant3",
      52530: "CameraCalibration3",
      52531: "ColorMatrix3",
      52532: "ForwardMatrix3",
      52533: "IlluminantData1",
      52534: "IlluminantData2",
      52535: "IlluminantData3",
      52536: "MaskSubArea",
      52537: "ProfileHueSatMapData3",
      52538: "ReductionMatrix3",
      52539: "RGBTables",
    };
    exports2.Photo = {
      33434: "ExposureTime",
      33437: "FNumber",
      34850: "ExposureProgram",
      34852: "SpectralSensitivity",
      34855: "ISOSpeedRatings",
      34856: "OECF",
      34864: "SensitivityType",
      34865: "StandardOutputSensitivity",
      34866: "RecommendedExposureIndex",
      34867: "ISOSpeed",
      34868: "ISOSpeedLatitudeyyy",
      34869: "ISOSpeedLatitudezzz",
      36864: "ExifVersion",
      36867: "DateTimeOriginal",
      36868: "DateTimeDigitized",
      36880: "OffsetTime",
      36881: "OffsetTimeOriginal",
      36882: "OffsetTimeDigitized",
      37121: "ComponentsConfiguration",
      37122: "CompressedBitsPerPixel",
      37377: "ShutterSpeedValue",
      37378: "ApertureValue",
      37379: "BrightnessValue",
      37380: "ExposureBiasValue",
      37381: "MaxApertureValue",
      37382: "SubjectDistance",
      37383: "MeteringMode",
      37384: "LightSource",
      37385: "Flash",
      37386: "FocalLength",
      37396: "SubjectArea",
      37500: "MakerNote",
      37510: "UserComment",
      37520: "SubSecTime",
      37521: "SubSecTimeOriginal",
      37522: "SubSecTimeDigitized",
      37888: "Temperature",
      37889: "Humidity",
      37890: "Pressure",
      37891: "WaterDepth",
      37892: "Acceleration",
      37893: "CameraElevationAngle",
      40960: "FlashpixVersion",
      40961: "ColorSpace",
      40962: "PixelXDimension",
      40963: "PixelYDimension",
      40964: "RelatedSoundFile",
      40965: "InteroperabilityTag",
      41483: "FlashEnergy",
      41484: "SpatialFrequencyResponse",
      41486: "FocalPlaneXResolution",
      41487: "FocalPlaneYResolution",
      41488: "FocalPlaneResolutionUnit",
      41492: "SubjectLocation",
      41493: "ExposureIndex",
      41495: "SensingMethod",
      41728: "FileSource",
      41729: "SceneType",
      41730: "CFAPattern",
      41985: "CustomRendered",
      41986: "ExposureMode",
      41987: "WhiteBalance",
      41988: "DigitalZoomRatio",
      41989: "FocalLengthIn35mmFilm",
      41990: "SceneCaptureType",
      41991: "GainControl",
      41992: "Contrast",
      41993: "Saturation",
      41994: "Sharpness",
      41995: "DeviceSettingDescription",
      41996: "SubjectDistanceRange",
      42016: "ImageUniqueID",
      42032: "CameraOwnerName",
      42033: "BodySerialNumber",
      42034: "LensSpecification",
      42035: "LensMake",
      42036: "LensModel",
      42037: "LensSerialNumber",
      42080: "CompositeImage",
      42081: "SourceImageNumberOfCompositeImage",
      42082: "SourceExposureTimesOfCompositeImage",
      42240: "Gamma",
    };
    exports2.Iop = {
      1: "InteroperabilityIndex",
      2: "InteroperabilityVersion",
      4096: "RelatedImageFileFormat",
      4097: "RelatedImageWidth",
      4098: "RelatedImageLength",
    };
    exports2.GPSInfo = {
      0: "GPSVersionID",
      1: "GPSLatitudeRef",
      2: "GPSLatitude",
      3: "GPSLongitudeRef",
      4: "GPSLongitude",
      5: "GPSAltitudeRef",
      6: "GPSAltitude",
      7: "GPSTimeStamp",
      8: "GPSSatellites",
      9: "GPSStatus",
      10: "GPSMeasureMode",
      11: "GPSDOP",
      12: "GPSSpeedRef",
      13: "GPSSpeed",
      14: "GPSTrackRef",
      15: "GPSTrack",
      16: "GPSImgDirectionRef",
      17: "GPSImgDirection",
      18: "GPSMapDatum",
      19: "GPSDestLatitudeRef",
      20: "GPSDestLatitude",
      21: "GPSDestLongitudeRef",
      22: "GPSDestLongitude",
      23: "GPSDestBearingRef",
      24: "GPSDestBearing",
      25: "GPSDestDistanceRef",
      26: "GPSDestDistance",
      27: "GPSProcessingMethod",
      28: "GPSAreaInformation",
      29: "GPSDateStamp",
      30: "GPSDifferential",
      31: "GPSHPositioningError",
    };
  },
});

// node_modules/exif-reader/index.js
var require_exif_reader = __commonJS({
  "node_modules/exif-reader/index.js"(exports2, module2) {
    var tags = require_tags();
    module2.exports = function (buffer) {
      var startingOffset = 0;
      if (
        buffer.toString("ascii", 0, 3) !== "MM\0" &&
        buffer.toString("ascii", 0, 3) !== "II*"
      ) {
        startingOffset = 6;
        if (buffer.toString("ascii", 0, 5) !== "Exif\0")
          throw new Error(
            'Invalid EXIF data: buffer should start with "Exif", "MM" or "II".',
          );
      }
      var bigEndian = null;
      if (buffer[startingOffset] === 73 && buffer[startingOffset + 1] === 73)
        bigEndian = false;
      else if (
        buffer[startingOffset] === 77 &&
        buffer[startingOffset + 1] === 77
      )
        bigEndian = true;
      else throw new Error("Invalid EXIF data: expected byte order marker.");
      if (
        buffer.length < startingOffset + 4 ||
        readUInt16(buffer, startingOffset + 2, bigEndian) !== 42
      )
        throw new Error("Invalid EXIF data: expected 0x002A.");
      if (buffer.length <= startingOffset + 8) {
        throw new Error("Invalid EXIF data: Ends before ifdOffset");
      }
      var ifdOffset =
        readUInt32(buffer, startingOffset + 4, bigEndian) + startingOffset;
      if (ifdOffset < 8) throw new Error("Invalid EXIF data: ifdOffset < 8");
      var result = { bigEndian };
      result.Image = readTags(
        buffer,
        ifdOffset,
        bigEndian,
        tags.Image,
        startingOffset,
      );
      if (buffer.length >= ifdOffset + 2) {
        var numEntries = readUInt16(buffer, ifdOffset, bigEndian);
        if (buffer.length >= ifdOffset + 2 + numEntries * 12 + 4) {
          ifdOffset = readUInt32(
            buffer,
            ifdOffset + 2 + numEntries * 12,
            bigEndian,
          );
          if (ifdOffset !== 0)
            result.Thumbnail = readTags(
              buffer,
              ifdOffset + startingOffset,
              bigEndian,
              tags.Image,
              startingOffset,
            );
        }
      }
      if (result.Image) {
        if (isPositiveInteger(result.Image.ExifTag))
          result.Photo = readTags(
            buffer,
            result.Image.ExifTag + startingOffset,
            bigEndian,
            tags.Photo,
            startingOffset,
          );
        if (isPositiveInteger(result.Image.GPSTag))
          result.GPSInfo = readTags(
            buffer,
            result.Image.GPSTag + startingOffset,
            bigEndian,
            tags.GPSInfo,
            startingOffset,
          );
      }
      if (result.Photo && isPositiveInteger(result.Photo.InteroperabilityTag)) {
        result.Iop = readTags(
          buffer,
          result.Photo.InteroperabilityTag + startingOffset,
          bigEndian,
          tags.Iop,
          startingOffset,
        );
      }
      return result;
    };
    var DATE_KEYS = {
      DateTimeOriginal: true,
      DateTimeDigitized: true,
      DateTime: true,
    };
    function readTags(buffer, offset, bigEndian, tags2, startingOffset) {
      if (buffer.length < offset + 2) {
        return null;
      }
      var numEntries = readUInt16(buffer, offset, bigEndian);
      offset += 2;
      var res = {};
      for (var i = 0; i < numEntries; i++) {
        if (buffer.length >= offset + 2) {
          var tag = readUInt16(buffer, offset, bigEndian);
        } else {
          return null;
        }
        offset += 2;
        var key = tags2[tag] || tag;
        var val = readTag(buffer, offset, bigEndian, startingOffset);
        if (key in DATE_KEYS) val = parseDate(val);
        res[key] = val;
        offset += 10;
      }
      return res;
    }
    var SIZE_LOOKUP = [1, 1, 2, 4, 8, 1, 1, 2, 4, 8];
    function readTag(buffer, offset, bigEndian, startingOffset) {
      if (buffer.length < offset + 7) {
        return null;
      }
      var type = readUInt16(buffer, offset, bigEndian);
      if (!type || type > SIZE_LOOKUP.length) return null;
      var numValues = readUInt32(buffer, offset + 2, bigEndian);
      var valueSize = SIZE_LOOKUP[type - 1];
      var valueOffset;
      if (valueSize * numValues <= 4) {
        valueOffset = offset + 6;
      } else {
        if (buffer.length >= offset + 10) {
          valueOffset =
            readUInt32(buffer, offset + 6, bigEndian) + startingOffset;
        } else {
          return null;
        }
      }
      if (type === 2) {
        var asciiSlice = buffer.slice(valueOffset, valueOffset + numValues);
        if (asciiSlice.some((x) => x >> 7 > 0)) return asciiSlice;
        var string = asciiSlice.toString("ascii");
        if (string[string.length - 1] === "\0") string = string.slice(0, -1);
        return string;
      }
      if (type === 7) return buffer.slice(valueOffset, valueOffset + numValues);
      if (numValues === 1)
        return readValue(buffer, valueOffset, bigEndian, type);
      var res = [];
      for (var i = 0; i < numValues && valueOffset < buffer.length; i++) {
        res.push(readValue(buffer, valueOffset, bigEndian, type));
        valueOffset += valueSize;
      }
      return res;
    }
    function readValue(buffer, offset, bigEndian, type) {
      switch (type) {
        case 1:
          if (buffer.length < offset + 1) {
            return null;
          }
          return buffer[offset];
        case 3:
          if (buffer.length < offset + 2) {
            return null;
          }
          return readUInt16(buffer, offset, bigEndian);
        case 4:
          if (buffer.length < offset + 4) {
            return null;
          }
          return readUInt32(buffer, offset, bigEndian);
        case 5:
          if (buffer.length < offset + 8) {
            return null;
          }
          return (
            readUInt32(buffer, offset, bigEndian) /
            readUInt32(buffer, offset + 4, bigEndian)
          );
        case 6:
          if (buffer.length < offset + 1) {
            return null;
          }
          return buffer.readInt8(offset);
        case 8:
          if (buffer.length < offset + 2) {
            return null;
          }
          return readInt16(buffer, offset, bigEndian);
        case 9:
          if (buffer.length < offset + 4) {
            return null;
          }
          return readInt32(buffer, offset, bigEndian);
        case 10:
          if (buffer.length < offset + 8) {
            return null;
          }
          return (
            readInt32(buffer, offset, bigEndian) /
            readInt32(buffer, offset + 4, bigEndian)
          );
      }
    }
    function parseDate(string) {
      if (typeof string !== "string") return null;
      var match = string.match(
        /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
      );
      if (!match) return null;
      return new Date(
        Date.UTC(
          match[1],
          match[2] - 1,
          match[3],
          match[4],
          match[5],
          match[6],
          0,
        ),
      );
    }
    function isPositiveInteger(value) {
      return (
        typeof value === "number" && Math.floor(value) === value && value > 0
      );
    }
    function readUInt16(buffer, offset, bigEndian) {
      if (bigEndian) return buffer.readUInt16BE(offset);
      return buffer.readUInt16LE(offset);
    }
    function readUInt32(buffer, offset, bigEndian) {
      if (bigEndian) return buffer.readUInt32BE(offset);
      return buffer.readUInt32LE(offset);
    }
    function readInt16(buffer, offset, bigEndian) {
      if (bigEndian) return buffer.readInt16BE(offset);
      return buffer.readInt16LE(offset);
    }
    function readInt32(buffer, offset, bigEndian) {
      if (bigEndian) return buffer.readInt32BE(offset);
      return buffer.readInt32LE(offset);
    }
  },
});

// lambda/handler.ts
var handler_exports = {};
__export(handler_exports, {
  _resetClientsForTesting: () => _resetClientsForTesting,
  handler: () => handler,
});
module.exports = __toCommonJS(handler_exports);
var import_path2 = __toESM(require("path"));
var import_promises2 = __toESM(require("fs/promises"));
var import_sharp3 = __toESM(require("sharp"));
var import_client_s3 = require("@aws-sdk/client-s3");
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");

// src/infrastructure/services/imageService.ts
var import_sharp = __toESM(require("sharp"));
var import_promises = __toESM(require("fs/promises"));
var import_path = __toESM(require("path"));
var THUMBNAIL_SIZES = [300, 600, 1200, 2400];
var WEBP_QUALITY = 82;
var AVIF_QUALITY = 80;
async function getImageMetadata(inputPath) {
  return (0, import_sharp.default)(inputPath).metadata();
}
async function generateDerivatives(inputPath, outputDir) {
  await import_promises.default.mkdir(outputDir, { recursive: true });
  const metadata = await getImageMetadata(inputPath);
  const originalWidth = metadata.width ?? 0;
  const generatedPaths = [];
  for (const width of THUMBNAIL_SIZES) {
    if (originalWidth < width) {
      continue;
    }
    const pipeline = (0, import_sharp.default)(inputPath)
      .rotate()
      .resize(width, null, {
        fit: "inside",
        withoutEnlargement: true,
        kernel: "lanczos3",
      })
      .withMetadata();
    const webpPath = import_path.default.join(outputDir, `${width}w.webp`);
    await pipeline
      .clone()
      .webp({
        quality: WEBP_QUALITY,
        effort: 4,
        // Balance speed/compression (0-6, 4 is good middle ground)
      })
      .toFile(webpPath);
    generatedPaths.push(webpPath);
    const avifPath = import_path.default.join(outputDir, `${width}w.avif`);
    await pipeline
      .clone()
      .avif({
        quality: AVIF_QUALITY,
        effort: 4,
        // Balance speed/compression (0-9, 4 is good middle ground)
      })
      .toFile(avifPath);
    generatedPaths.push(avifPath);
  }
  return generatedPaths;
}
async function generateBlurPlaceholder(inputPath) {
  const buffer = await (0, import_sharp.default)(inputPath)
    .rotate()
    .resize(10, null, { fit: "inside" })
    .webp({ quality: 20 })
    .toBuffer();
  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

// src/infrastructure/services/exifService.ts
var import_sharp2 = __toESM(require("sharp"));
var import_exif_reader = __toESM(require_exif_reader());
var METERING_MODE_MAP = {
  0: "Unknown",
  1: "Average",
  2: "Center-weighted average",
  3: "Spot",
  4: "Multi-spot",
  5: "Pattern",
  6: "Partial",
};
var WHITE_BALANCE_MAP = {
  0: "Auto",
  1: "Manual",
};
var FLASH_MAP = {
  0: "Did not fire",
  1: "Fired",
  5: "Fired, return not detected",
  7: "Fired, return detected",
  8: "Did not fire, compulsory",
  9: "Fired, compulsory",
  13: "Fired, compulsory, return not detected",
  15: "Fired, compulsory, return detected",
  16: "Did not fire, compulsory suppression",
  24: "Did not fire, auto",
  25: "Fired, auto",
  29: "Fired, auto, return not detected",
  31: "Fired, auto, return detected",
  32: "No flash function",
  65: "Fired, red-eye reduction",
  69: "Fired, red-eye reduction, return not detected",
  71: "Fired, red-eye reduction, return detected",
  73: "Fired, compulsory, red-eye reduction",
  77: "Fired, compulsory, red-eye, return not detected",
  79: "Fired, compulsory, red-eye, return detected",
  89: "Fired, auto, red-eye reduction",
  93: "Fired, auto, red-eye, return not detected",
  95: "Fired, auto, red-eye, return detected",
};
function formatShutterSpeed(exposureTime) {
  if (exposureTime == null) return null;
  if (exposureTime >= 1) return `${exposureTime}s`;
  return `1/${Math.round(1 / exposureTime)}`;
}
function mapWhiteBalance(value) {
  if (value == null) return null;
  return WHITE_BALANCE_MAP[value] ?? null;
}
function mapMeteringMode(value) {
  if (value == null) return null;
  return METERING_MODE_MAP[value] ?? null;
}
function mapFlash(value) {
  if (value == null) return null;
  if (FLASH_MAP[value] != null) return FLASH_MAP[value];
  return value & 1 ? "Fired" : "Did not fire";
}
async function extractExifData(imagePath) {
  try {
    const metadata = await (0, import_sharp2.default)(imagePath).metadata();
    if (!metadata.exif) return null;
    const parsed = (0, import_exif_reader.default)(metadata.exif);
    const cameraMake = parsed.Image?.Make ?? parsed.Photo?.Make ?? null;
    const cameraModel = parsed.Image?.Model ?? parsed.Photo?.Model ?? null;
    const lens = parsed.Photo?.LensModel ?? null;
    const focalLength = parsed.Photo?.FocalLength ?? null;
    const aperture = parsed.Photo?.FNumber ?? null;
    const shutterSpeed = formatShutterSpeed(parsed.Photo?.ExposureTime);
    const iso = parsed.Photo?.ISOSpeedRatings ?? null;
    let dateTaken = null;
    const dateRaw = parsed.Photo?.DateTimeOriginal;
    if (dateRaw instanceof Date) {
      dateTaken = dateRaw.toISOString();
    } else if (typeof dateRaw === "string") {
      dateTaken = dateRaw;
    }
    const whiteBalance = mapWhiteBalance(parsed.Photo?.WhiteBalance);
    const meteringMode = mapMeteringMode(parsed.Photo?.MeteringMode);
    const flash = mapFlash(parsed.Photo?.Flash);
    return {
      cameraMake,
      cameraModel,
      lens,
      focalLength,
      aperture,
      shutterSpeed,
      iso,
      dateTaken,
      whiteBalance,
      meteringMode,
      flash,
    };
  } catch {
    return null;
  }
}

// lambda/handler.ts
import_sharp3.default.cache(false);
var _s3;
var _dynamodb;
function getS3() {
  if (!_s3) {
    _s3 = new import_client_s3.S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
    });
  }
  return _s3;
}
function getDynamoDB() {
  if (!_dynamodb) {
    _dynamodb = import_lib_dynamodb.DynamoDBDocumentClient.from(
      new import_client_dynamodb.DynamoDBClient({
        region: process.env.AWS_REGION ?? "us-east-1",
      }),
      { marshallOptions: { removeUndefinedValues: true } },
    );
  }
  return _dynamodb;
}
function getPhotosTable() {
  return `${process.env.DYNAMODB_TABLE_PREFIX ?? ""}Photos`;
}
function getBucket() {
  return process.env.S3_BUCKET;
}
function _resetClientsForTesting(s3, dynamodb) {
  _s3 = s3;
  _dynamodb = dynamodb;
}
var CONTENT_TYPES = {
  ".webp": "image/webp",
  ".avif": "image/avif",
};
async function retryDbUpdate(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      console.error(
        `DB update retry ${i + 1}/${attempts}`,
        err instanceof Error ? err.message : err,
      );
      if (i < attempts - 1)
        await new Promise((r) => setTimeout(r, 1e3 * (i + 1)));
    }
  }
}
async function processRecord(photoId, originalKey) {
  const tempDir = `/tmp/lambda-${photoId}`;
  const originalFilename = import_path2.default.basename(originalKey);
  const tempOriginalPath = import_path2.default.join(tempDir, originalFilename);
  try {
    const result = await getDynamoDB().send(
      new import_lib_dynamodb.GetCommand({
        TableName: getPhotosTable(),
        Key: { id: photoId },
      }),
    );
    if (!result.Item) {
      console.error(`Photo not found: ${photoId}`);
      return;
    }
    if (result.Item.status === "ready") {
      return;
    }
    await import_promises2.default.mkdir(tempDir, { recursive: true });
    const s3Response = await getS3().send(
      new import_client_s3.GetObjectCommand({
        Bucket: getBucket(),
        Key: originalKey,
      }),
    );
    const bytes = await s3Response.Body.transformToByteArray();
    await import_promises2.default.writeFile(
      tempOriginalPath,
      Buffer.from(bytes),
    );
    await generateDerivatives(tempOriginalPath, tempDir);
    const rotatedMeta = await (0, import_sharp3.default)(tempOriginalPath)
      .rotate()
      .metadata();
    const width = rotatedMeta.width;
    const height = rotatedMeta.height;
    const exifData = await extractExifData(tempOriginalPath);
    const blurDataUrl = await generateBlurPlaceholder(tempOriginalPath);
    const entries = await import_promises2.default.readdir(tempDir, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith("original")) continue;
      const ext = import_path2.default.extname(entry.name);
      const contentType = CONTENT_TYPES[ext];
      if (!contentType) continue;
      const fileBuffer = await import_promises2.default.readFile(
        import_path2.default.join(tempDir, entry.name),
      );
      await getS3().send(
        new import_client_s3.PutObjectCommand({
          Bucket: getBucket(),
          Key: `processed/${photoId}/${entry.name}`,
          Body: fileBuffer,
          ContentType: contentType,
        }),
      );
    }
    await getDynamoDB().send(
      new import_lib_dynamodb.UpdateCommand({
        TableName: getPhotosTable(),
        Key: { id: photoId },
        UpdateExpression:
          "SET #status = :status, blurDataUrl = :blurDataUrl, exifData = :exifData, width = :width, height = :height, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": "ready",
          ":blurDataUrl": blurDataUrl,
          ":exifData": exifData,
          ":width": width,
          ":height": height,
          ":updatedAt": Date.now(),
        },
      }),
    );
  } finally {
    try {
      await import_promises2.default.rm(tempDir, {
        recursive: true,
        force: true,
      });
    } catch {
      console.warn(`Failed to clean up temp dir: ${tempDir}`);
    }
  }
}
async function handler(event) {
  const batchItemFailures = [];
  for (const record of event.Records) {
    try {
      const { photoId, originalKey } = JSON.parse(record.body);
      await processRecord(photoId, originalKey);
    } catch (err) {
      console.error(
        `Failed to process record ${record.messageId}`,
        err instanceof Error ? err.message : err,
      );
      try {
        const { photoId } = JSON.parse(record.body);
        await retryDbUpdate(async () => {
          await getDynamoDB().send(
            new import_lib_dynamodb.UpdateCommand({
              TableName: getPhotosTable(),
              Key: { id: photoId },
              UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":status": "error",
                ":updatedAt": Date.now(),
              },
            }),
          );
        });
      } catch {
        console.error("Failed to mark photo as error after processing failure");
      }
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}
// Annotate the CommonJS export names for ESM import in node:
0 &&
  (module.exports = {
    _resetClientsForTesting,
    handler,
  });
