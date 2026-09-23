import { Controller, Get, Headers } from "@nestjs/common";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsDepositHoldsService } from "./operations-deposit-holds.service";

@Controller("operations/deposit-holds")
export class OperationsDepositHoldsController {
  constructor(
    private readonly deposits: OperationsDepositHoldsService,
    private readonly access: OperationsAccessService
  ) {}

  @Get()
  async board(@Headers("authorization") authorization: string | undefined) {
    return this.deposits.board(await this.access.requireAccessToken(authorization));
  }
}
