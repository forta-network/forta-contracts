import { Address, BigInt } from "@graphprotocol/graph-ts";
import { clearStore, test, assert } from "matchstick-as";
import { Scanner } from "../../generated/schema";
import {
  createManagerEnabledEvent,
  createScannerEnabledEvent,
  createScannerUpdatedEvent,
  createTransferEvent,
  handleManagerEnabled,
  handleScannerEnabled,
  handleScannerUpdated,
  handleTransfer,
} from "../datasources/ScannerRegistry";

test("Scanner is successfully created on transfer event", () => {
  const mockScannerTransferEvent = createTransferEvent(
    Address.zero(),
    Address.zero(),
    BigInt.fromString("92602676983101940350471475877918459195971018380")
  );

  handleTransfer(mockScannerTransferEvent);

  assert.fieldEquals(
    "Scanner",
    BigInt.fromString(
      "92602676983101940350471475877918459195971018380"
    ).toHex(),
    "id",
    BigInt.fromString("92602676983101940350471475877918459195971018380").toHex()
  );
  clearStore();
});

test("Scanner is successfully updated on update event", () => {
  const scanner = new Scanner(
    BigInt.fromString("92602676983101940350471475877918459195971018380").toHex()
  );
  scanner.chainId = BigInt.fromI32(1);
  scanner.enabled = true;
  scanner.disableFlags = 0;
  scanner.owner = Address.zero().toHex();
  scanner.metadata = "";
  scanner.save();

  const mockScannerUpdateEvent = createScannerUpdatedEvent(
    BigInt.fromString("92602676983101940350471475877918459195971018380"),
    BigInt.fromI32(1),
    "Test"
  );

  handleScannerUpdated(mockScannerUpdateEvent);

  assert.fieldEquals("Scanner", scanner.id, "metadata", "Test");
  clearStore();
});

test("Scanner manager is successfully created", () => {
  const scanner = new Scanner(
    BigInt.fromString("92602676983101940350471475877918459195971018380").toHex()
  );
  scanner.chainId = BigInt.fromI32(1);
  scanner.enabled = true;
  scanner.disableFlags = 0;
  scanner.owner = Address.zero().toHex();
  scanner.metadata = "";
  scanner.save();

  const mockManagerEvent = createManagerEnabledEvent(
    BigInt.fromString("92602676983101940350471475877918459195971018380"),
    Address.zero(),
    true
  );

  handleManagerEnabled(mockManagerEvent);

  assert.fieldEquals(
    "ScannerManager",
    BigInt.fromString("92602676983101940350471475877918459195971018380")
      .toHex()
      .concat("/")
      .concat(Address.zero().toHex()),
    "id",
    BigInt.fromString("92602676983101940350471475877918459195971018380")
      .toHex()
      .concat("/")
      .concat(Address.zero().toHex())
  );
  clearStore();
});

test("Scanner is successfully enabled on update event", () => {
  const scanner = new Scanner(
    BigInt.fromString("92602676983101940350471475877918459195971018380").toHex()
  );
  scanner.chainId = BigInt.fromI32(1);
  scanner.enabled = false;
  scanner.disableFlags = 0;
  scanner.owner = Address.zero().toHex();
  scanner.metadata = "";
  scanner.save();

  const mockScannerEnabledEvent = createScannerEnabledEvent(
    BigInt.fromString("92602676983101940350471475877918459195971018380"),
    true,
    1,
    true
  );

  handleScannerEnabled(mockScannerEnabledEvent);

  assert.fieldEquals(
    "Scanner",
    BigInt.fromString(
      "92602676983101940350471475877918459195971018380"
    ).toHex(),
    "enabled",
    "true"
  );
  clearStore();
});
