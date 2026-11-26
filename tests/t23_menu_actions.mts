import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Row menu: "Confirmar pagamento/recebimento" and "Marcar como pago" never both show for the same row. Invented data only.
const crPath = process.env.CONFIRM_RECEIPT_MODULE || frontSrc('utils/confirmReceipt.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(crPath).href);

console.log('\n[menu actions] utils/confirmReceipt.ts paymentMenuActions');

check('pending expense/income with the confirm dialog available: only "Confirmar", no "Marcar como pago"', () => {
  for (const type of ['EXPENSE', 'INCOME']) {
    assert.deepEqual(C.paymentMenuActions({ id: 'a', type, paid: false }, true), { confirm: true, markAsPaid: false, markAsPending: false });
  }
});

check('pending row without the dialog (viewer/read-only callers or no handler): the plain toggle stays', () => {
  assert.deepEqual(C.paymentMenuActions({ id: 'a', type: 'EXPENSE', paid: false }, false), { confirm: false, markAsPaid: true, markAsPending: false });
});

check('pending transfer/allocation (not confirmable): the plain toggle stays even with the handler', () => {
  for (const type of ['TRANSFER', 'ALLOCATION']) {
    assert.deepEqual(C.paymentMenuActions({ id: 'a', type, paid: false }, true), { confirm: false, markAsPaid: true, markAsPending: false });
  }
});

check('paid rows (paid true or undefined): only "Marcar como pendente"', () => {
  for (const paid of [true, undefined]) {
    assert.deepEqual(C.paymentMenuActions({ id: 'a', type: 'EXPENSE', paid }, true), { confirm: false, markAsPaid: false, markAsPending: true });
  }
});

check('a row without id offers no confirm; at most one of confirm/markAsPaid is ever true', () => {
  assert.equal(C.paymentMenuActions({ id: undefined, type: 'EXPENSE', paid: false }, true).confirm, false);
  for (const type of ['EXPENSE', 'INCOME', 'TRANSFER', 'ALLOCATION', undefined])
    for (const paid of [true, false, undefined])
      for (const can of [true, false]) {
        const a = C.paymentMenuActions({ id: 'x', type, paid }, can);
        assert.ok(!(a.confirm && a.markAsPaid), `both shown for ${type}/${paid}/${can}`);
        assert.ok(!(a.markAsPaid && a.markAsPending), `toggle both ways for ${type}/${paid}/${can}`);
      }
});
