import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type ProductUpdateInput = {
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

function requiredIfIncluded(value: unknown) {
  if (value === undefined) return undefined;

  const text = optionalString(value);
  if (!text) {
    throw new Error('Required field is empty');
  }

  return text;
}

function numberIfIncluded(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return 0;

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error('Number field is invalid');
  }

  return numberValue;
}

function optionalNumberIfIncluded(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error('Number field is invalid');
  }

  return numberValue;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = (await request.json()) as ProductUpdateInput;
    const product = await prisma.product.update({
      where: {
        id: params.id,
      },
      data: {
        skuCode: requiredIfIncluded(body.skuCode),
        productName: requiredIfIncluded(body.productName),
        category: body.category === undefined ? undefined : optionalString(body.category),
        qtyCtn: numberIfIncluded(body.qtyCtn),
        palletLocation: body.palletLocation === undefined ? undefined : optionalString(body.palletLocation),
        sellingPrice: optionalNumberIfIncluded(body.sellingPrice),
      },
    });

    return NextResponse.json({
      ok: true,
      data: product,
    });
  } catch (error) {
    console.error('Failed to update product', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to update product',
      },
      { status: error instanceof Error && error.message.includes('field') ? 400 : 500 },
    );
  }
}
