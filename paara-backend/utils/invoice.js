const PDFDocument = require('pdfkit');

const pdfText = (value) => String(value ?? '')
  .replace(/₹/g, 'INR ')
  .replace(/[–—]/g, '-')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[^\x20-\x7E]/g, '');

function money(value) {
  const amount = Number(value) || 0;
  return `INR ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function createInvoicePdf(order, items, address) {
  return new Promise((resolve, reject) => {
    if (!order || !Array.isArray(items)) {
      reject(new Error('Invoice requires an order and item list.'));
      return;
    }
    const invoiceItems = items.map((item) => ({
      product_name: item.product_name || item.name || `Product #${item.product_id || ''}`,
      unit_price: Number(item.unit_price ?? item.price) || 0,
      quantity: Number(item.quantity) || 0,
      line_total: Number(item.line_total) || 0,
    }));
    const chunks = [];
    const doc = new PDFDocument({ margin: 50, size: 'A4', compress: true });
    const displayOrderNumber = order.order_number || `ORD-${order.id}`;
    const paymentLabel = order.payment_method === 'cod' ? 'Cash on Delivery' : order.payment_status === 'paid' ? 'Paid online' : 'Online payment pending';
    doc.info.Title = `Paara invoice for order ${displayOrderNumber}`;
    doc.info.Author = 'Paara Jewellery';
    doc.info.Subject = 'Order invoice';
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const invoiceDate = new Date(order.created_at || Date.now()).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const rule = (color = '#eadfce') => {
      doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(color).lineWidth(0.7).stroke();
      doc.moveDown(0.6);
    };
    doc.fillColor('#3d2b24').font('Helvetica-Bold').fontSize(25).text('PAARA');
    doc.fillColor('#8b6b43').font('Helvetica').fontSize(11).text('JEWELLERY INVOICE');
    doc.moveDown(0.5);
    rule('#d7b06b');
    doc.fillColor('#3d2b24').font('Helvetica-Bold').fontSize(13).text(pdfText(`Invoice for Order ${displayOrderNumber}`));
    doc.text(pdfText(`Date: ${invoiceDate}`));
    doc.text(pdfText(`Status: ${(order.payment_status === 'paid' ? 'PAID' : order.status || 'PROCESSING').toUpperCase()}`));
    doc.text(pdfText(`Payment: ${paymentLabel}`));
    if (order.payment_reference) doc.text(pdfText(`Payment Reference: ${order.payment_reference}`));
    if (order.customer_name || order.name) doc.text(pdfText(`Customer: ${order.customer_name || order.name}`));
    doc.moveDown(1.2);
    if (address) {
      doc.fillColor('#8b6b43').font('Helvetica-Bold').fontSize(10).text('SHIPPING ADDRESS');
      doc.fillColor('#3d2b24').font('Helvetica').fontSize(10);
      doc.text(pdfText(`${address.line1}${address.line2 ? `, ${address.line2}` : ''}`));
      doc.text(pdfText(`${address.city}, ${address.state} - ${address.pincode}`));
    }
    doc.moveDown(1.2);
    doc.moveDown(1);
    doc.fillColor('#8b6b43').font('Helvetica-Bold').fontSize(11).text('ORDER ITEMS');
    doc.moveDown(0.4);
    const tableTop = doc.y;
    doc.rect(left, tableTop - 3, width, 22).fill('#f3eadb');
    doc.fillColor('#3d2b24').fontSize(9).text('ITEM', left + 8, tableTop + 4);
    doc.text('QTY', left + 335, tableTop + 4, { width: 40, align: 'right' });
    doc.text('AMOUNT', left + 390, tableTop + 4, { width: 95, align: 'right' });
    doc.y = tableTop + 27;
    invoiceItems.forEach((item) => {
      const rowTop = doc.y;
      doc.font('Helvetica').fontSize(10).fillColor('#3d2b24').text(pdfText(item.product_name), left + 8, rowTop, { width: 300 });
      doc.fontSize(9).fillColor('#8b6b43').text(`Unit price ${money(item.unit_price)}`, left + 8, rowTop + 13, { width: 300 });
      doc.fillColor('#3d2b24').text(String(item.quantity), left + 335, rowTop + 4, { width: 40, align: 'right' });
      doc.text(pdfText(money(item.line_total)), left + 390, rowTop + 4, { width: 95, align: 'right' });
      doc.y = rowTop + 34;
      rule();
    });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#3d2b24');
    doc.text(pdfText(`Subtotal: ${money(order.subtotal)}`), left + 300, doc.y, { width: 185, align: 'right' });
    doc.text(pdfText(`Discount: ${money(order.discount_amount || 0)}`), left + 300, doc.y, { width: 185, align: 'right' });
    if (!order.hideTaxBreakdown) doc.text('Taxes: Included in product prices', left + 300, doc.y, { width: 185, align: 'right' });
    doc.text(pdfText(`Delivery Charge: ${money(order.shipping_amount)}`), left + 300, doc.y, { width: 185, align: 'right' });
    doc.moveDown(0.4);
    const totalTop = doc.y;
    doc.rect(left + 280, totalTop, 205, 29).fill('#3d2b24');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text(pdfText(`TOTAL PAYABLE: ${money(order.total_amount)}`), left + 290, totalTop + 8, { width: 185, align: 'right' });
    doc.y = totalTop + 42;
    doc.fillColor('#8b6b43').font('Helvetica').fontSize(9).text('Thank you for choosing Paara.');
    doc.end();
  });
}

module.exports = { createInvoicePdf };
