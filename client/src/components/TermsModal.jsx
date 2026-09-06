// Read-only "Terms and Conditions" popup — opened from the mandatory
// acceptance checkbox on both registration forms (HelperRegister.jsx /
// BeneficiaryRegister.jsx) and from Settings > Legal > Terms and Conditions
// (see Settings.jsx). Full "General Terms and Conditions Remar Switzerland"
// text (Article 1-11), supplied by Remar; minor cleanup only of stray
// link/formatting artifacts from the source document (e.g. "[transport]"
// link remnants), no wording changes. Same modal pattern used elsewhere in
// the app (e.g. the registration Preview popup).
export default function TermsModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2200] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold remar-green">Terms and Conditions</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <p className="text-xs text-gray-400 mb-4">General Terms and Conditions Remar Switzerland</p>

        <div className="text-sm text-gray-600 space-y-4 leading-relaxed">
          <Article title="Article 1 — Scope">
            <p>These terms and conditions apply to all services offered by REMAR Switzerland: clearances, cleaning, removals/transport, personal assistance/helping services and collections.</p>
            <p>Specific regulations concerning particular services provided by REMAR Switzerland are detailed in the corresponding offer.</p>
            <p>Detailed service requirements for cleaning services are set out on page two of this document.</p>
            <p>These General Terms and Conditions are based on the provisions of the Swiss Code of Obligations (OR) and the Agreement between the Swiss Confederation and the European Community on the Carriage of Goods and Passengers by Rail and Road (AS 2002, 1649).</p>
          </Article>

          <Article title="Article 2 — Payment">
            <p><span className="font-semibold text-gray-700">Payment of the amount due:</span> For first-time customers, the amount payable is to be settled in cash after completion of the work, unless otherwise stipulated in the offer.</p>
            <p><span className="font-semibold text-gray-700">Amount:</span> The sum payable corresponds to the amount stated in the offer. If no offer has been issued, the amount quoted verbally before the execution of the order applies.</p>
            <p><span className="font-semibold text-gray-700">Payment deadline:</span> The deadline for settling the invoice is specified in the offer and may include various payment methods, such as cash payment or a payment period of 10 days.</p>
            <p><span className="font-semibold text-gray-700">Removals:</span> Payment is made based on the hourly rate after completion of the removal.</p>
            <p><span className="font-semibold text-gray-700">Cleaning:</span> Payment is made after successful handover of the apartment in accordance with the acceptance guarantee.</p>
          </Article>

          <Article title="Article 3 — Rescheduling / Cancellation by the Client">
            <p><span className="font-semibold text-gray-700">Right to reschedule a move:</span> The client has the right to reschedule the move during the process, provided they fully cover any additional costs incurred. These additional costs will be estimated on-site by our specialists and agreed upon with the client.</p>
            <p><span className="font-semibold text-gray-700">Cancellation procedure:</span> Any cancellation by the client must be made in writing.</p>
            <p><span className="font-semibold text-gray-700">Cancellation fees:</span> A flat fee of CHF 300 is due for cancellations made within 5 calendar days of the scheduled service date.</p>
            <p><span className="font-semibold text-gray-700">Cancellation for hourly-based services:</span> If the cancellation concerns a service billed on an hourly basis (e.g., moving, personal assistance, support work), a flat fee of CHF 300 is owed as compensation for time, effort, and expenses already incurred.</p>
          </Article>

          <Article title="Article 4 — Cancellation">
            <p>For cancellations of orders made indefinitely with less than 5 days' notice, a flat fee of CHF 300 will be charged. Cancellation fees will be invoiced with a payment term of 14 days. No cancellation fees will apply if the appointment is rescheduled to a different date.</p>
          </Article>

          <Article title="Article 5 — Working Hours">
            <p>The lunch break is not counted as working time and is therefore not charged, however employees are entitled to a "mid-morning snack break".</p>
          </Article>

          <Article title="Article 6 — Round trip">
            <p>For transport and removals within Switzerland, billing is based on an hourly rate, including travel time.</p>
            <p>For cleaning and clearance services, round-trip travel is already included in the quoted price and is therefore not billed separately.</p>
          </Article>

          <Article title="Article 7 — Cost Details">
            <p>Our prices include fuel and insurance (except for the excess). Packaging materials are charged separately.</p>
          </Article>

          <Article title="Article 8 — Our Services">
            <p>Remar Switzerland performs its services diligently, reliably, and cost-effectively, on time. Remar Switzerland provides its services on behalf of the client and acts as a supportive partner in fulfilling the client's service requirements.</p>
          </Article>

          <Article title="Article 9 — Services of the Client">
            <p className="font-semibold text-gray-700">Transport</p>
            <p>The client is responsible for providing suitable packaging. They must inform Remar Switzerland in a timely manner of all addresses relevant to the ordered service (collection and delivery addresses). The client is obligated to inform the employees, especially the drivers, of the special nature of the goods being transported and their susceptibility to damage. Unless otherwise agreed (in writing), the client is responsible for obtaining all necessary documents, permits, and road closures for the transport. The client is fully liable for the agreed-upon order, even in the event of a reduction in value or total loss. Any offsetting against the order is excluded.</p>

            <p className="font-semibold text-gray-700 mt-3">International Transport</p>
            <p>The client is obligated to declare the goods being transported truthfully and assumes full responsibility towards the Remar driver, as well as railway and customs authorities or other relevant agencies. Without specific instructions from the client, the Remar driver in Switzerland is entitled to treat the goods as personal effects. The client is responsible for obtaining the necessary customs documents and for their accuracy. The client is liable for all consequences arising from the absence, delayed delivery, incompleteness, or inaccuracy of these documents. The client is also liable to the Remar driver for all expenses incurred in connection with the customs clearance of the goods. The price for customs clearance assumes a standard procedure. Extended customs delays and special negotiations with the relevant authorities will be charged to the Remar driver accordingly. The Remar driver is not obligated to advance freight charges, customs duties, or taxes. However, the driver may request advance payments from the client in the respective currency. If the driver from Remar advances payment, he is entitled to reimbursement of the advance payment commission and interest, as well as any reasonable exchange rate loss. The client is responsible for all expenses and additional costs incurred as a result of delayed acceptance of the transported goods. If unloading cannot commence within a waiting period of four hours, the driver from Remar is entitled to store the transported goods at the client's expense and risk. In this case, his liability is limited to the careful selection of the storage location. Cash, bearer securities, including securities as defined by the Stock Exchange Act that have bearer characteristics, and precious metals are expressly excluded from transport.</p>

            <p className="font-semibold text-gray-700 mt-3">Cleaning</p>
            <p>Furniture or items left for the next tenant are not included in the cleaning fee and will only be cleaned by express agreement.</p>
            <p>The client is responsible for removing: nails, screws, wall plugs, hooks, adhesives, foils and the like. The following items are to be replaced by the client: filter mats (kitchen/bathroom); the filter mats will be replaced by Remar.</p>
            <p>Equipment belonging to the property that is permanently attached to the building and part of the property's fixtures will be cleaned. Any required servicing of these appliances must be carried out and maintained by a qualified professional at the tenant's own expense.</p>
            <p>Floors, wooden walls, and wooden ceilings are wiped down with a damp cloth and are not specially treated. Joints in floors and walls are not cleaned or treated separately or with special care. Abrasive cleaners are expressly not used. Wallpaper, plaster, and paint on walls and ceilings are expressly excluded from cleaning.</p>
            <p>Deposits or other soiling are pre-treated and cleaned using specially designed agents. If residues are still visible after two intensive cleaning processes, no further work will be carried out. Any liability for damage, diminished value, or subsequent cleaning is excluded for any remaining residues upon acceptance.</p>
            <p>Excluded from cleaning are: fireplaces, chimneys, fire bowls, pizza ovens and gas or charcoal grills or other fires on the balcony, terrace or seating area.</p>
            <p>Defective shutters and blinds will not be cleaned. The client is responsible for their functionality and repair. We expressly disclaim all liability for damage to or defective cables on blinds that may result from simple handling.</p>
            <p><span className="font-semibold text-gray-700">Balcony & Terrace:</span> the following are excluded from cleaning: weather-related soiling; moss and discoloration on metal parts, railings, and all parapets and floors; cleaning of the drainage channels and their uncovering; fabrics or other coverings on awnings.</p>
            <p>Artificial turf and other protective floor coverings will not be removed or disposed of. Flower pots will not be cleaned, emptied, or disposed of.</p>
            <p>Any follow-up cleaning that the client performs themselves or commissions to another cleaning company cannot be invoiced or deducted from the outstanding invoice. The services provided by Remar must be carefully inspected by the client immediately after completion, but no later than 6 hours. Any defects must be reported in writing immediately within this period. Remar will rectify any defects or errors in service either through mutually agreed-upon corrective action within 24-48 hours or by adjusting the costs accordingly due to the reduction in service. Remar's warranty obligation is void if the client alters, modifies, or damages the services provided by Remar, including any goods supplied.</p>

            <p className="font-semibold text-gray-700 mt-3">Eviction</p>
            <p>Upon placement of the order for clearance and disposal, the material becomes the property of the organiser in accordance with the agreement.</p>
            <p>Subsequent claims for disposed property are expressly excluded for disposal/clearance orders. Any property that does not require disposal must be removed from the premises before the order is placed. Disposed material that should not have been disposed of cannot be invoiced to the contractor.</p>
            <p>However, no dowels, sockets of any kind, internet connections, TV boxes, thermostats, hooks, nails, screws, etc. will be dismantled or removed from floors, ceilings, walls, doors, etc. — this is the responsibility of the client.</p>
            <p>We strive to implement ecological and economic principles in waste disposal and, where possible, rely on regional network partners at our own discretion.</p>
            <p>Items that cannot be disposed of must be removed before work begins. Where this is not possible, the items that do not need to be disposed of must be mentioned in writing in the work order.</p>
            <p>Usable items will be reused where possible — any offsetting against the order is excluded.</p>
            <p>Refrigerators, freezers, all freezer compartments, and perishable materials must be properly disposed of by the client at least 48 hours before the scheduled disposal. Refrigerators and freezers must be completely emptied and defrosted. Failure to comply entitles Remar to charge an additional fee of at least CHF 200.</p>
            <p>If the client disposes of items themselves after placing the order or uses them for their own purposes, the agreed amount remains owed and cannot be deducted from the outstanding invoice.</p>
            <p>Should further items require disposal after the agreed-upon removal and/or disposal date, this will constitute a new order. This new order will again be billed at a basic flat rate of CHF 250, plus disposal fees, skip hire, trailer rental, and an hourly rate of CHF 55 per person. The client is obligated to make a corresponding advance payment of at least 75% of the expected costs upon simple request before work commences.</p>
          </Article>

          <Article title="Article 10 — Liability">
            <p>The client is liable and responsible for the service. Separate insurance with a deductible, which the client will cover, can be arranged upon agreement.</p>
          </Article>

          <Article title="Article 11 — Disclaimer">
            <p>If loading or delivery is delayed due to breakdown, accident, weather conditions or other reasons for which Remar Switzerland is not at fault, the client has no right to any compensation.</p>
            <p>Remar Switzerland is not liable for damage to the cargo caused by fire, accidents, wars, strikes, force majeure or damage to the means of transport caused by third parties.</p>
          </Article>
        </div>

        <button type="button" onClick={onClose}
          className="w-full mt-5 bg-remar text-white py-2 rounded-lg font-semibold text-sm hover:bg-remar transition">
          Close
        </button>
      </div>
    </div>
  );
}

// A bold article heading + its paragraphs — keeps the long legal text
// scannable without a bulleted list (spacing/shading over hard rules, same
// convention used elsewhere in the app).
const Article = ({ title, children }) => (
  <div>
    <h3 className="text-sm font-bold remar-green mb-1.5">{title}</h3>
    <div className="space-y-2">{children}</div>
  </div>
);
