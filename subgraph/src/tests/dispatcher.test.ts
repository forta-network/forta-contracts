import { BigInt } from "@graphprotocol/graph-ts";
import { assert, test } from "matchstick-as";
import { createLinkEvent, handleLink } from "../datasources/Dispatcher";

test("Should create a link event", () => {
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
