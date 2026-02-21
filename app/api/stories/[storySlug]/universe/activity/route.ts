import { NextResponse } from 'next/server';

export async function GET() {
    const now = new Date().toISOString();
    return NextResponse.json({
        activity: {
            generatedAt: now,
            eventCount: 0,
            events: [],
            activeBranches: [],
        }
    });
}
