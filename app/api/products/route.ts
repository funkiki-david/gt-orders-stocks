import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: {
        skuCode: 'asc',
      },
    });

    return NextResponse.json({
      ok: true,
      data: products,
    });
  } catch (error) {
    console.error('Failed to load products', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to load products',
      },
      { status: 500 },
    );
  }
}
