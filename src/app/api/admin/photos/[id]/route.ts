import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { deletePhotoFiles } from "@/infrastructure/storage";
import { DynamoDBPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import { z } from "zod";
import { logger } from "@/infrastructure/logging/logger";
import { isValidUUID } from "@/infrastructure/validation";

const photoRepository = new DynamoDBPhotoRepository();

const updatePhotoSchema = z.object({
  description: z.string().nullable(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/photos/[id]
 *
 * Updates a photo's description.
 *
 * Request body: { description: string | null }
 * Returns: Updated photo object
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    // 1. Verify admin session
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get photo ID from route params
    const { id } = await context.params;

    // 2.1 Validate photo ID format
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: "Invalid photo ID format" },
        { status: 400 },
      );
    }

    // 3. Fetch existing photo
    const photo = await photoRepository.findById(id);
    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    // 4. Parse and validate request body
    const body = await request.json();
    const result = updatePhotoSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: z.flattenError(result.error).fieldErrors,
        },
        { status: 400 },
      );
    }

    // 5. Update photo
    photo.description = result.data.description;
    photo.updatedAt = new Date();
    await photoRepository.save(photo);

    return NextResponse.json(photo);
  } catch (error) {
    logger.error("PATCH /api/admin/photos/[id] failed", {
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/photos/[id]
 *
 * Deletes a photo and all associated files.
 *
 * Steps:
 * 1. Verify admin session
 * 2. Fetch photo by ID
 * 3. Delete all files from storage
 * 4. Delete photo record from database
 *
 * Returns: 204 No Content on success
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    // 1. Verify admin session
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get photo ID from route params
    const { id } = await context.params;

    // 2.1 Validate photo ID format
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: "Invalid photo ID format" },
        { status: 400 },
      );
    }

    // 3. Fetch existing photo
    const photo = await photoRepository.findById(id);
    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    // 4. Delete all files from storage (before DB delete)
    await deletePhotoFiles(id);

    // 5. Delete photo record from database
    await photoRepository.delete(id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("DELETE /api/admin/photos/[id] failed", {
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
