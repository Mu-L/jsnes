import { fromJSON, toJSON } from "../utils.js";

class ChannelDM {
  constructor(papu) {
    this.papu = papu;

    this.MODE_NORMAL = 0;
    this.MODE_LOOP = 1;
    this.MODE_IRQ = 2;

    this.isEnabled = false;
    this.hasSample = false;
    this.irqGenerated = false;
    this.playMode = this.MODE_NORMAL;
    this.dmaFrequency = 0;
    this.dmaCounter = 0;
    this.deltaCounter = 0;
    this.playStartAddress = 0;
    this.playAddress = 0;
    this.playLength = 0;
    this.playLengthCounter = 0;
    this.sample = 0;
    this.dacLsb = 0;
    this.shiftCounter = 0;
    this.reg4012 = 0;
    this.reg4013 = 0;
    this.data = 0;
    this.lastFetchedByte = 0;

    this.JSON_PROPERTIES = [
      "MODE_NORMAL",
      "MODE_LOOP",
      "MODE_IRQ",
      "isEnabled",
      "hasSample",
      "irqGenerated",
      "playMode",
      "dmaFrequency",
      "dmaCounter",
      "deltaCounter",
      "playStartAddress",
      "playAddress",
      "playLength",
      "playLengthCounter",
      "shiftCounter",
      "reg4012",
      "reg4013",
      "sample",
      "dacLsb",
      "data",
      "lastFetchedByte",
    ];
  }

  clockDmc() {
    // Only alter DAC value if the sample buffer has data:
    if (this.hasSample) {
      if ((this.data & 1) === 0) {
        // Decrement delta:
        if (this.deltaCounter > 0) {
          this.deltaCounter--;
        }
      } else {
        // Increment delta:
        if (this.deltaCounter < 63) {
          this.deltaCounter++;
        }
      }

      // Update sample value:
      this.sample = this.isEnabled ? (this.deltaCounter << 1) + this.dacLsb : 0;

      // Update shift register:
      this.data >>= 1;
    }

    this.dmaCounter--;
    if (this.dmaCounter <= 0) {
      // No more sample bits.
      this.hasSample = false;
      this.endOfSample();
      this.dmaCounter = 8;
    }

    if (this.irqGenerated) {
      this.papu.nes.cpu.requestIrq(this.papu.nes.cpu.IRQ_NORMAL);
    }
  }

  endOfSample() {
    if (this.playLengthCounter === 0 && this.playMode === this.MODE_LOOP) {
      // Start from beginning of sample:
      this.playAddress = this.playStartAddress;
      this.playLengthCounter = this.playLength;
    }

    if (this.playLengthCounter > 0) {
      // Fetch next sample:
      this.nextSample();

      if (this.playLengthCounter === 0) {
        // Last byte of sample fetched, generate IRQ:
        if (this.playMode === this.MODE_IRQ) {
          // Generate IRQ:
          this.irqGenerated = true;
        }
      }
    }
  }

  nextSample() {
    // Fetch byte:
    this.data = this.papu.nes.mmap.load(this.playAddress);
    // On real hardware, the DMA fetch puts this byte on the CPU data bus.
    // Store it so cpu.load() can detect DMA bus hijacking mid-instruction.
    // See https://www.nesdev.org/wiki/APU_DMC#Memory_reader
    this.lastFetchedByte = this.data;
    this.papu.nes.cpu.haltCycles(4);

    this.playLengthCounter--;
    this.playAddress++;
    if (this.playAddress > 0xffff) {
      this.playAddress = 0x8000;
    }

    this.hasSample = true;
  }

  writeReg(address, value) {
    if (address === 0x4010) {
      // Play mode, DMA Frequency
      if (value >> 6 === 0) {
        this.playMode = this.MODE_NORMAL;
      } else if (((value >> 6) & 1) === 1) {
        this.playMode = this.MODE_LOOP;
      } else if (value >> 6 === 2) {
        this.playMode = this.MODE_IRQ;
      }

      if ((value & 0x80) === 0) {
        this.irqGenerated = false;
      }

      this.dmaFrequency = this.papu.getDmcFrequency(value & 0xf);
    } else if (address === 0x4011) {
      // Delta counter load register:
      this.deltaCounter = (value >> 1) & 63;
      this.dacLsb = value & 1;
      this.sample = (this.deltaCounter << 1) + this.dacLsb; // update sample value
    } else if (address === 0x4012) {
      // DMA address load register
      this.playStartAddress = (value << 6) | 0x0c000;
      this.playAddress = this.playStartAddress;
      this.reg4012 = value;
    } else if (address === 0x4013) {
      // Length of play code
      this.playLength = (value << 4) + 1;
      this.playLengthCounter = this.playLength;
      this.reg4013 = value;
    } else if (address === 0x4015) {
      // DMC/IRQ Status
      if (((value >> 4) & 1) === 0) {
        // Disable:
        this.playLengthCounter = 0;
      } else {
        // Restart:
        this.playAddress = this.playStartAddress;
        this.playLengthCounter = this.playLength;
        // On real hardware, when DMC is enabled and the sample buffer is
        // empty, a DMA fetch fires within a few CPU cycles. Trigger it
        // immediately so the DMASync loop in test ROMs can detect the
        // first fetch. See https://www.nesdev.org/wiki/APU_DMC
        if (!this.hasSample && this.playLengthCounter > 0) {
          this.nextSample();
          this.dmaCounter = 8;
          this.shiftCounter = this.dmaFrequency;
        }
      }
      this.irqGenerated = false;
    }
  }

  setEnabled(value) {
    if (!this.isEnabled && value) {
      this.playLengthCounter = this.playLength;
    }
    this.isEnabled = value;
  }

  getLengthStatus() {
    return this.playLengthCounter === 0 || !this.isEnabled ? 0 : 1;
  }

  getIrqStatus() {
    return this.irqGenerated ? 1 : 0;
  }

  toJSON() {
    return toJSON(this);
  }

  fromJSON(s) {
    fromJSON(this, s);
  }
}

export default ChannelDM;
