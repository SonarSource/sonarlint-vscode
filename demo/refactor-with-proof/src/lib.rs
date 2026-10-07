pub fn classify(value: u32) -> u32 {
    if value > 0 {
        if value > 10 {
            if value > 20 {
                if value > 30 {
                    if value > 40 {
                        if value > 50 {
                            if value > 60 {
                                if value > 70 {
                                    return 8;
                                }
                                return 7;
                            }
                            return 6;
                        }
                        return 5;
                    }
                    return 4;
                }
                return 3;
            }
            return 2;
        }
        return 1;
    }
    0
}
