import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type CustomerUpdateInput = {
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

function requiredIfIncluded(value: unknown, field: string) {
  if (value === undefined) return undefined;

  const text = optionalString(value);
  if (!text) {
    throw new Error(`Invalid ${field}`);
  }

  return text;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = (await request.json()) as CustomerUpdateInput;
    const customer = await prisma.customer.update({
      where: {
        id: params.id,
      },
      data: {
        companyName: requiredIfIncluded(body.companyName, 'companyName'),
        contactPerson: body.contactPerson === undefined ? undefined : optionalString(body.contactPerson),
        phone: body.phone === undefined ? undefined : optionalString(body.phone),
        email: body.email === undefined ? undefined : optionalString(body.email),
        billingAddress: body.billingAddress === undefined ? undefined : optionalString(body.billingAddress),
        shippingAddress: body.shippingAddress === undefined ? undefined : optionalString(body.shippingAddress),
        paymentTerm: body.paymentTerm === undefined ? undefined : optionalString(body.paymentTerm),
        salesRep: body.salesRep === undefined ? undefined : optionalString(body.salesRep),
        notes: body.notes === undefined ? undefined : optionalString(body.notes),
      },
    });

    return NextResponse.json({
      ok: true,
      data: customer,
    });
  } catch (error) {
    console.error('Failed to update customer', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to update customer',
      },
      { status: error instanceof Error && error.message.startsWith('Invalid') ? 400 : 500 },
    );
  }
}
