import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { deletePhotoFiles } from "@/infrastructure/storage";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories";
import { z } from "zod";

const photoRepository = new SQLitePhotoRepository();

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
    console.error("[API] PATCH /api/admin/photos/[id]:", error);
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
    console.error("[API] DELETE /api/admin/photos/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
