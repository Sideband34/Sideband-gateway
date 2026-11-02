import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Devices' };

const rows = [
  ['Android, Bluetooth LE discovery', 'Not tested', 'Needs physical-device testing; permissions vary by OS version.'],
  ['Android, local Wi-Fi transfer', 'Not tested', 'Planned for sustained data transfer after BLE negotiation.'],
  ['iOS, Bluetooth LE discovery', 'Not tested', 'Background and discovery limits differ from Android.'],
  ['iOS, local Wi-Fi transfer', 'Not tested', 'Platform restrictions apply.'],
];

export default function Devices() {
  return (
    <>
      <h1>Device support</h1>
      <p className="lede">
        No device has been verified yet. This table will only list a configuration as supported after
        it passes an on-device test.
      </p>
      <table>
        <caption className="sr-only">Device capability matrix</caption>
        <thead>
          <tr>
            <th scope="col">Configuration</th>
            <th scope="col">Status</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([c, s, n]) => (
            <tr key={c}>
              <th scope="row">{c}</th>
              <td>{s}</td>
              <td>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Downloads</h2>
      <p>There is no app store listing yet. This page will link to official listings once they exist.</p>
    </>
  );
}
