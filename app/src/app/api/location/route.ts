import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, jsonError } from "@/lib/api";
import { CELL_PATTERN } from "@/lib/geo/geohash";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/location  { cell }
// `cell` is a 6-character geohash the phone computed from its own GPS fix. Coordinates are
// never sent, and this route rejects anything that is not exactly a 6-character cell.
// The database stores it only if the person has location sharing on and ghost mode off.
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in first.");

  const body = await request.json().catch(() => null);
  const cell = typeof body?.cell === "string" ? body.cell : "";
  if (!CELL_PATTERN.test(cell)) return jsonError(400, "Invalid location cell.");

  const { data: stored, error } = await createAdminClient().rpc("set_location_cell", {
    p_user_id: session.userId,
    p_cell: cell,
  });
  if (error) {
    console.error(error);
    return jsonError(500, "Could not save your location.");
  }
  return NextResponse.json({ ok: true, stored: stored === true });
}
