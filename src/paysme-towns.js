// PaySME SDK v1.13.1 keeps its town list private to the SDK.
export const PAYSME_TOWNS = Object.freeze([
  'Aminuis', 'Arandis', 'Aranos', 'Aroab', 'Aus', 'Berseba', 'Bethanie',
  'Bukalo', 'Divundu', 'Dordabis', 'Eenhana', 'Engela', 'Epupa', 'Gibeon',
  'Gobabis', 'Gochas', 'Groot Aub', 'Grootfontein', 'Grünau', 'Helao Nafidi',
  'Henties Bay', 'Kalkfeld', 'Kalkrand', 'Kamanjab', 'Karasburg', 'Karibib',
  'Katima Mulilo', 'Keetmanshoop', 'Khorixas', 'Koës', 'Kongola', 'Leonardville',
  'Linyanti', 'Lüderitz', 'Maltahöhe', 'Mariental', 'Nkurenkuru', 'Noordoewer',
  'Ohangwena', 'Okahandja', 'Okahao', 'Okakarara', 'Okalongo', 'Okongo',
  'Omaruru', 'Omuthiya', 'Onayena', 'Ondangwa', 'Ongwediva', 'Oniipa', 'Opuwo',
  'Oranjemund', 'Oshakati', 'Oshikango', 'Oshikuku', 'Otavi', 'Otjinene',
  'Otjiwarongo', 'Outapi', 'Outjo', 'Rehoboth', 'Ruacana', 'Rundu', 'Sesfontein',
  'Stampriet', 'Swakopmund', 'Tsandi', 'Tses', 'Tsumeb', 'Tsumkwe', 'Uis',
  'Usakos', 'Walvis Bay', 'Warmbad', 'Windhoek', 'Witvlei'
]);

export function checkoutTown(account) {
  const town = account?.user_metadata?.checkout_town;
  return PAYSME_TOWNS.includes(town) ? town : '';
}
