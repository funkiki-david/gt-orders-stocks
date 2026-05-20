import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : '';
}

function paymentLabel(value: string | null, status: string) {
  if (value) return value;
  if (status === 'PAID') return 'Paid';
  if (status === 'NO_CHARGE') return 'No Charge';
  return 'Unpaid';
}

function fulfillmentLabel(status: string) {
  if (status === 'SHIPPED') return 'Shipped';
  if (status === 'BILLED_CLOSED') return 'Billed Closed';
  if (status === 'CANCELLED') return 'Cancelled';
  return 'Open';
}

type CustomerInput = {
  companyName?: unknown;
  contactPerson?: unknown;
  phone?: unknown;
  email?: unknown;
  billingAddress?: unknown;
  shippingAddress?: unknown;
  paymentTerm?: unknown;
  salesRep?: unknown;
  notes?: unknown;
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

export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: {
        companyName: 'asc',
      },
      include: {
        salesOrders: {
          orderBy: [
            {
              orderDate: 'desc',
            },
            {
              salesOrderNumber: 'desc',
            },
          ],
          include: {
            items: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });

    const data = customers.map((customer) => {
      const totalOrders = customer.salesOrders.length;
      const openOrders = customer.salesOrders.filter((order) => order.fulfillmentStatus === 'OPEN').length;
      const completedOrders = customer.salesOrders.filter((order) => order.fulfillmentStatus === 'BILLED_CLOSED').length;
      const cancelledOrders = customer.salesOrders.filter((order) => order.fulfillmentStatus === 'CANCELLED').length;
      const totalAmount = customer.salesOrders.reduce((sum, order) => sum + Number(order.subtotal), 0);
      const lastOrder = customer.salesOrders[0]?.orderDate ?? null;
      const salesRep =
        customer.salesRep ??
        customer.salesOrders.find((order) => order.salesRep)?.salesRep ??
        '—';
      const paymentStatuses = Array.from(
        new Set(customer.salesOrders.map((order) => paymentLabel(order.paymentInfo, order.paymentStatus))),
      ).filter(Boolean);

      return {
        id: customer.id,
        companyName: customer.companyName,
        contactPerson: customer.contactPerson,
        phone: customer.phone,
        email: customer.email,
        billingAddress: customer.billingAddress,
        shippingAddress: customer.shippingAddress,
        paymentTerm: customer.paymentTerm,
        salesRep: customer.salesRep,
        notes: customer.notes,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        summary: {
          totalOrders,
          openOrders,
          completedOrders,
          cancelledOrders,
          totalAmount,
          lastOrder: formatDate(lastOrder),
        },
        ui: {
          id: customer.id,
          name: customer.companyName,
          orders: totalOrders,
          total: totalAmount,
          payment: paymentStatuses.join(' / '),
          salesRep,
          lastOrder: formatDate(lastOrder),
          contactPerson: customer.contactPerson,
          phone: customer.phone,
          email: customer.email,
          billingAddress: customer.billingAddress,
          shippingAddress: customer.shippingAddress,
          paymentTerm: customer.paymentTerm,
          notes: customer.notes,
        },
        salesOrders: customer.salesOrders.map((order) => ({
          id: order.id,
          invoice: order.salesOrderNumber,
          date: formatDate(order.orderDate),
          shipDate: formatDate(order.shipDate),
          customer: customer.companyName,
          po: order.poNumber ?? '',
          payment: paymentLabel(order.paymentInfo, order.paymentStatus),
          shipMethod: order.shipMethod ?? '',
          shipCost: order.shipCost === null ? '' : String(order.shipCost),
          salesRep: order.salesRep ?? '',
          items: order.items.map((item) => ({
            id: item.id,
            sku: item.skuCode,
            description: item.productDescription,
            width: item.width ?? '',
            length: item.length ?? '',
            category: item.category ?? '',
            qty: item.qtyCtn,
            unitPrice: Number(item.unitPrice),
            total: Number(item.total),
          })),
          totalQty: order.totalQty,
          subtotal: Number(order.subtotal),
          fulfillmentStatus: fulfillmentLabel(order.fulfillmentStatus),
          paymentStatus: paymentLabel(null, order.paymentStatus),
          cancelReason: order.cancelReason,
          statusNotes: order.statusNotes ?? '',
        })),
      };
    });

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error('Failed to load customers', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to load customers',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CustomerInput;
    const customer = await prisma.customer.create({
      data: {
        companyName: requiredString(body.companyName, 'companyName'),
        contactPerson: optionalString(body.contactPerson),
        phone: optionalString(body.phone),
        email: optionalString(body.email),
        billingAddress: optionalString(body.billingAddress),
        shippingAddress: optionalString(body.shippingAddress),
        paymentTerm: optionalString(body.paymentTerm),
        salesRep: optionalString(body.salesRep),
        notes: optionalString(body.notes),
      },
    });

    return NextResponse.json({
      ok: true,
      data: customer,
    });
  } catch (error) {
    console.error('Failed to create customer', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to create customer',
      },
      { status: error instanceof Error && error.message.startsWith('Invalid') ? 400 : 500 },
    );
  }
}
