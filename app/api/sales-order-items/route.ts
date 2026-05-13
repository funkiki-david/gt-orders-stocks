import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type SalesOrderItemCreateInput = {
  salesOrderId?: unknown;
  skuCode?: unknown;
  productDescription?: unknown;
  width?: unknown;
  length?: unknown;
  category?: unknown;
  qtyCtn?: unknown;
  unitPrice?: unknown;
  total?: unknown;
  palletLocationSnapshot?: unknown;
};

function optionalString(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function requiredString(value: unknown, field: string) {
  const text = optionalString(value);

  if (!text) {
    throw new Error(`Invalid ${field}`);
  }

  return text;
}

function requiredNumber(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`Invalid ${field}`);
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`Invalid ${field}`);
  }

  return numberValue;
}

function optionalNumber(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null;

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`Invalid ${field}`);
  }

  return numberValue;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SalesOrderItemCreateInput;
    const salesOrderId = requiredString(body.salesOrderId, 'salesOrderId');
    const skuCode = requiredString(body.skuCode, 'skuCode');
    const productDescription = requiredString(body.productDescription, 'productDescription');
    const qtyCtn = Math.trunc(requiredNumber(body.qtyCtn, 'qtyCtn'));
    const unitPrice = requiredNumber(body.unitPrice, 'unitPrice');
    const total = optionalNumber(body.total, 'total') ?? qtyCtn * unitPrice;

    const createdSalesOrderItem = await prisma.$transaction(async (transaction) => {
      const existingOrder = await transaction.salesOrder.findUnique({
        where: {
          id: salesOrderId,
        },
      });

      if (!existingOrder) {
        throw new Error('Invalid salesOrderId');
      }

      const createdItem = await transaction.salesOrderItem.create({
        data: {
          salesOrderId,
          skuCode,
          productDescription,
          width: optionalString(body.width),
          length: optionalString(body.length),
          category: optionalString(body.category),
          qtyCtn,
          unitPrice,
          total,
          palletLocationSnapshot: optionalString(body.palletLocationSnapshot),
        },
      });
      const siblingItems = await transaction.salesOrderItem.findMany({
        where: {
          salesOrderId,
        },
      });

      await transaction.salesOrder.update({
        where: {
          id: salesOrderId,
        },
        data: {
          totalQty: siblingItems.reduce((sum, item) => sum + item.qtyCtn, 0),
          subtotal: siblingItems.reduce((sum, item) => sum + Number(item.total), 0),
        },
      });

      return createdItem;
    });

    return NextResponse.json({
      ok: true,
      data: createdSalesOrderItem,
    });
  } catch (error) {
    console.error('Failed to create sales order item', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to create sales order item',
      },
      { status: error instanceof Error && error.message.startsWith('Invalid') ? 400 : 500 },
    );
  }
}
