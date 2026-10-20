import { searchPolicies } from "@/lib/policySearch";

export async function POST(request: Request) {
  const { query } = await request.json();

  const results = await searchPolicies(query);

  return Response.json({
    results,
  });
}