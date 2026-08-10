import { redirect } from 'next/navigation';

import { ShoppingList } from '@/components/ShoppingList';
import { getIdentity } from '@/lib/auth/session';
import { getShoppingList, pruneOldBoughtItems } from '@/lib/services/shopping';

export const metadata = { title: 'Shopping' };

export default async function ShoppingPage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  const { household } = identity;

  // Tidy away anything bought over a week ago before reading. Nobody is ever
  // going to press "clear" as a task in its own right, so the list has to keep
  // itself from growing forever.
  await pruneOldBoughtItems(household);
  const { needed, bought } = await getShoppingList(household);

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-2">Shared list</p>
        <h1 className="display text-4xl sm:text-5xl">Shopping</h1>
        <p className="mt-3 max-w-md text-[15px] text-pretty text-ink-muted">
          Everyone in {household.name} sees the same list. Add things as you run out.
        </p>
      </header>

      <ShoppingList needed={needed} bought={bought} />
    </div>
  );
}
