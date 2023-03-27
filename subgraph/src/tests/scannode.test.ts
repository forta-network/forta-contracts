import { BigInt } from "@graphprotocol/graph-ts";
import { assert, describe, test } from "matchstick-as";
import { createLinkEvent, handleLink } from "../datasources/Dispatcher";
import { scannerBigIntToHex } from "../fetch/scannode";


test("Should create a scan node", () => {
  const idMock = BigInt.fromString(
    "92602676983101940350471475877918459195971018380"
  );
  const mockLinkEvent = createLinkEvent(idMock, idMock, true);

  handleLink(mockLinkEvent);

  assert.fieldEquals(
    "Link",
    idMock
      .toHex()
      .concat("/")
      .concat(idMock.toHex()),
    "active",
    "true"
  );
});

describe("scannerBigIntToHex", () => {
  test("Should not pad address of number with extra zeros and generate the correct hex string", () => {
    const value = BigInt.fromString("278520430252167027517634569313170690884943004878");
    const expectedHex = "0x30c949bce002812ac3ce17a53eebc2641850c4ce";
    const actualHex = scannerBigIntToHex(value);
    assert.stringEquals(actualHex, expectedHex);
  });
  test("Should pad address of number with extra zeros and generate the correct hex string", () => {
    const value = BigInt.fromString("69905658690375506592430532475952538065412444756");
    const expectedHex = "0x0c3ead9b33decc8c188d5fa5f40ec9a288fe5254";
    const actualHex = scannerBigIntToHex(value);
    assert.stringEquals(actualHex, expectedHex);
  });
});

