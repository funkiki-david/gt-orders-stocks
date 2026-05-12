import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type ProductInput = {
  skuCode?: unknown;
  productName?: unknown;
  category?: unknown;
  qtyCtn?: unknown;
  palletLocation?: unknown;
  sellingPrice?: unknown;
};

function optionalString(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function requiredString(value: unknown) {
  const text = optionalString(value);
  if (!text) {
    throw new Error('Required field is missing');
  }

  return text;
}

function numberField(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new Error('Number field is invalid');
  }

  return numberValue;
}

function optionalNumberField(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new Error('Number field is invalid');
  }

  return numberValue;
}

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ProductInput;
    const product = await prisma.product.create({
      data: {
        skuCode: requiredString(body.skuCode),
        productName: requiredString(body.productName),
        category: optionalString(body.category),
        qtyCtn: numberField(body.qtyCtn),
        palletLocation: optionalString(body.palletLocation),
        sellingPrice: optionalNumberField(body.sellingPrice),
      },
    });

    return NextResponse.json({
      ok: true,
      data: product,
    });
  } catch (error) {
    console.error('Failed to create product', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to create product',
      },
      { status: error instanceof Error && error.message.includes('field') ? 400 : 500 },
    );
  }
}
